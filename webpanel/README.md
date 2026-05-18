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
