# HOWTO: Uruchomienie Huba Phantom Z Panelem Web

Ten przewodnik prowadzi od świeżego checkoutu do uruchomienia jednego huba
Phantom oraz panelu React w trybie developerskim. Notatki produkcyjne są na
końcu.

## 1. Zbuduj Huba Z WebAPI

Z katalogu głównego repozytorium:

```bash
./configure --with-webapi --prefix="$HOME/phantom"
make
make modules
make install
```

Ważne: `./configure` generuje `seed.h`. Ten sam `seed.h` musi zostać zachowany
dla wdrożenia, które używa zaszyfrowanych konfiguracji i userlist. Nie commituj
`seed.h`.

## 2. Utwórz Albo Zaktualizuj Konfigurację Huba

Najprostszy pierwszy start to interaktywny kreator:

```bash
cd "$HOME/phantom"
./phantom -n
```

Gdy konfiguracja już istnieje, upewnij się, że hub ma lokalny listener WebAPI:

```text
listen 127.0.0.1 5555 webapi
```

Typowy hub ma też listenery dla linków botów i dostępu partyline/users:

```text
listen 0.0.0.0 33100 bots
listen 0.0.0.0 33101 users
listen 127.0.0.1 5555 webapi
```

Trzymaj `webapi` na `127.0.0.1` albo zaufanym prywatnym interfejsie. Nie
wystawiaj surowego listenera WebAPI bezpośrednio do internetu.

## 3. Uruchom Huba

```bash
cd "$HOME/phantom"
./phantom hub.cfg
```

Użyj faktycznej nazwy pliku konfiguracji utworzonego przez `./phantom -n`.

Logowanie do panelu używa normalnego handle'a Phantom i hasła użytkownika, nie
`ownerpass`. Handle musi mieć uprawnienia partyline. Do samego logowania
potrzebna jest co najmniej flaga `+P`. Akcje administracyjne w panelu wymagają
tych samych flag, których wymagają odpowiadające im komendy partyline.

Jeśli zarządzasz użytkownikami z partyline, typowy zestaw komend wygląda tak:

```text
.+user admin
.chpass admin <mocne-haslo>
.chattr admin +P
```

Dodaj dodatkowe flagi administracyjne potrzebne dla Twojego workflow.

## 4. Uruchom Proxy WebAPI

W drugim terminalu, z checkoutu repozytorium:

```bash
cd webpanel
bun install
bun run proxy
```

Domyślne ustawienia proxy:

| Zmienna | Domyślnie | Znaczenie |
|---------|-----------|-----------|
| `WS_PORT` | `8080` | port WebSocket dla przeglądarki |
| `HUB_HOST` | `127.0.0.1` | host WebAPI huba Phantom |
| `HUB_PORT` | `5555` | port WebAPI huba Phantom |
| `HUB_SSL` | `false` | TLS dla połączenia TCP proxy -> hub |

Przykład z niestandardowym portem huba:

```bash
HUB_PORT=5556 bun run proxy
```

## 5. Uruchom Panel Web

W trzecim terminalu:

```bash
cd webpanel
bun run dev
```

Otwórz:

```text
http://localhost:3000
```

Zaloguj się handlem Phantom i hasłem użytkownika z kroku 3.

## 6. Tryb Produkcyjny

Zbuduj statyczny frontend:

```bash
cd webpanel
bun install
bun run build
```

Uruchom proxy Bun jako usługę:

```bash
cd webpanel
HUB_HOST=127.0.0.1 HUB_PORT=5555 WS_PORT=8080 bun run proxy
```

Serwuj `webpanel/dist` przez Caddy, nginx albo inny reverse proxy z HTTPS.
Dołączony `webpanel/Caddyfile` jest punktem startowym:

```bash
cd webpanel
caddy run --config Caddyfile
```

W produkcji podmień `panel.example.com` oraz ścieżkę `root` w Caddyfile.
Publiczny ruch HTTPS powinien kończyć się na reverse proxy, które przekazuje
`/ws` do proxy Bun działającego lokalnie.

## Rozwiązywanie Problemów

- `auth_fail: No partyline privileges`: dodaj handle'owi flagę `+P`.
- `auth_fail: Invalid password`: ustaw ponownie hasło użytkownika przez
  `.chpass`.
- Panel się ładuje, ale nie łączy: upewnij się, że działa `bun run proxy` i
  frontend przekazuje `/ws` do `localhost:8080`.
- Proxy nie łączy się z hubem: sprawdź, czy hub działa i ma
  `listen 127.0.0.1 5555 webapi`.
- Logowanie nie działa z innego hosta: sprawdź ograniczenia `.+addr` dla
  handle'a.
- Po przebudowie z innym `seed.h` stare zaszyfrowane konfiguracje/userlisty
  mogą przestać się odszyfrowywać. Przywróć seed wdrożenia albo utwórz pliki
  od nowa.
