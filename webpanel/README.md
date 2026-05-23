# phantom Web Panel

Panel do zarządzania botnetem przez przeglądarkę.

## Architektura

```
Browser ←─ WS ─→ Proxy (Bun) ←─ TCP/JSON ─→ Hub (WebAPI)
```

## Wymagania

- Bun (https://bun.sh)
- Node.js 18+ (dla Vite)
- Caddy (opcjonalnie, dla HTTPS w produkcji)

## Konfiguracja huba

1. Skompiluj huba z WebAPI:
   ```bash
   ./configure --with-webapi
   make
   ```

2. Dodaj listener WebAPI w konfiguracji bota:
   ```
   listen 127.0.0.1 5555 webapi
   ```

## Uruchomienie (development)

```bash
cd webpanel

# Zainstaluj zależności
bun install

# Terminal 1: proxy WS→TCP
bun run proxy

# Terminal 2: frontend dev server
bun run dev
```

Panel będzie dostępny pod `http://localhost:3000`

## Zmienne środowiskowe proxy

- `WS_PORT` - port WebSocket (domyślnie 8080)
- `HUB_HOST` - adres huba (domyślnie 127.0.0.1)
- `HUB_PORT` - port huba (domyślnie 5555)

Przykład:
```bash
HUB_PORT=5556 bun run proxy
```

## Produkcja

1. Zbuduj frontend:
   ```bash
   bun run build
   ```

2. Uruchom proxy:
   ```bash
   bun run proxy
   ```

3. Skonfiguruj Caddy:
   ```bash
   # Edytuj Caddyfile - zmień domenę i ścieżkę do dist/
   caddy run --config Caddyfile
   ```

## Użycie

- Zaloguj się handleem i hasłem partyline
- Lista botów wyświetla się automatycznie
- Wpisz `.komenda` aby wykonać komendę (np. `.help`, `.bots`)
- Wpisz tekst bez `.` aby wysłać wiadomość na partyline

## Endpoint bootstrap leafa (`POST /api/bot-add`)

Pozwala zewnętrznym skryptom dodawać leafa do huba bez wystawiania na świat
portu partyline (33101). Proxy gada z hubem przez istniejący kanał WebAPI
jako *service user* — wywołujący widzi tylko współdzielony API key, nie zna
poświadczeń huba.

Włączane przez ustawienie wszystkich trzech zmiennych środowiskowych
(domyślnie wyłączone — zwraca `503`):

| zmienna              | opis                                                       |
| -------------------- | ---------------------------------------------------------- |
| `BOT_ADD_API_KEY`    | bearer token wymagany w nagłówku `Authorization`           |
| `BOT_ADD_HUB_HANDLE` | handle service usera na hubie (musi mieć `+s` lub `+x`)    |
| `BOT_ADD_HUB_PASS`   | hasło partyline tego handle'a                              |
| `BOT_ADD_TIMEOUT_MS` | timeout całej sesji (domyślnie `10000`)                    |

Request:

```bash
curl -X POST https://panel.example.com/api/bot-add \
  -H "Authorization: Bearer ${BOT_ADD_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "nick": "leaf42",
    "password": "linkpass-generated-on-leaf",
    "addr": "203.0.113.7",
    "host_masks": ["*!*@host.example.com"]
  }'
```

Pola:

- `nick` (wymagane) — handle nowego leafa, `[A-Za-z0-9_\-\[\]\\^\`{|}]{1,32}`
- `password` (wymagane) — hasło linkowania bot↔hub
- `addr` (wymagane) — IP/host który zostanie wpisany jako `.+bot <nick> <addr>`
- `host_masks` (opcjonalne, do 16 wpisów) — dodatkowe maski `.+host`

Pod spodem proxy wykonuje sekwencję komend webapi: `+bot`, `chattr +l`,
`chpass`, `+host` (per wpis), `save`. Odpowiedź:

```json
{
  "ok": true,
  "nick": "leaf42",
  "commands": [
    { "cmd": "+bot leaf42 203.0.113.7", "result": "ok" },
    { "cmd": "chattr leaf42 +l",        "result": "ok" },
    { "cmd": "chpass leaf42 ...",       "result": "ok" },
    { "cmd": "+host leaf42 *!*@host.example.com", "result": "ok" },
    { "cmd": "save",                    "result": "ok" }
  ]
}
```

Kody statusu: `200` sukces, `400` zły request, `401` zły/brak tokenu, `502`
hub odrzucił którąś komendę, `503` endpoint wyłączony (brak env), `500`
crash. Hub partyline TCP może (i powinien) pozostać tylko na `127.0.0.1` —
endpoint nie wymaga go publicznie.
