# Phantom

```text
           __                __                
    ____  / /_  ____ _____  / /_____  ____ ___ 
   / __ \/ __ \/ __ `/ __ \/ __/ __ \/ __ `__ \
  / /_/ / / / / /_/ / / / / /_/ /_/ / / / / / /
 / .___/_/ /_/\__,_/_/ /_/\__/\____/_/ /_/ /_/ 
/_/                                defence bot
```

## Pochodzenie I Oryginalni Autorzy

**Phantom nie jest botem IRC napisanym od zera.** Projekt wywodzi się
bezpośrednio z historycznego **Psotnic** oraz późniejszego forka
**gay-psotnic**. Oryginalni autorzy i kontrybutorzy tych projektów pozostają
częścią publicznego łańcucha autorstwa Phantom i ta sekcja ma pozostać na
początku dokumentacji.

### Autorzy Psotnic

Na podstawie `AUTHORS-psotnic`:

| Osoba | Wkład |
|-------|-------|
| pks (Grzegorz Rusin) `<grusin@gmail.com>` | oryginalny autor, lider projektu |
| Esio `<esio@hoth.amu.edu.pl>` | development, zgłoszenia błędów |
| patrick `<patrick@psotnic.com>` | development, moduły, strona psotnic.com |

Kontrybutorzy Psotnic:

| Osoba | Wkład |
|-------|-------|
| cgod `<c@sii.ath.cx>` | moduły: date, peak2, words |
| dArk | wsparcie big endian |
| Darkman `<darkman82@interfree.it>` | EaZy psotnic, prace nad wiki |
| Googie (Pawel Salawa) `<boogie@myslenice.one.pl>` | `.bottree`, wskazówki Tcl |
| matrix `<admin@areaunix.org>` | moduły: google, peak |
| oroblram `<stu@wilf.co.uk>` | moduły: log, subop i inne |
| Pirat | zgłoszenia błędów |
| UukGoblin | poprawki x86 |
| wilk `<wilq.pl@vp.pl>` | patche, zgłoszenia błędów, propozycje funkcji |
| [C]167 (Stefan Valouch) `<stefanvalouch@googlemail.com>` | patche |

Oryginalne kredyty Psotnic dziękują także osobom z `#psotnic` na IRCnet,
`psotnic.sf.net` i `psotnic.com`.

### Autorzy gay-psotnic

Na podstawie `AUTHORS`:

| Osoba | Wkład |
|-------|-------|
| patrick `<patrick@psotnic.com>` | development gay-psotnic |
| pks (Grzegorz Rusin) `<grusin@gmail.com>` | oryginalny autor Psotnic |
| Esio `<esio@hoth.amu.edu.pl>` | development Psotnic |
| [C]167 (Stefan Valouch) `<stefanvalouch@googlemail.com>` | `make install` |

Testy gay-psotnic:

| Osoba | Wkład |
|-------|-------|
| anank `<anank@blackcode.it>` | testy |
| Aretino `<aretino@irc.it>` | testy |
| matrix `<admin@areaunix.org>` | testy |
| nerd | testy |

### Autorzy modyfikacji Phantom

| Osoba | Wkład |
|-------|-------|
| Jerzy (kofany) Dąbrowski [`github.com/kofany`](https://github.com/kofany) | modyfikacje forka Phantom, publiczny cleanup, panel web |
| Dominik (yooz) Juźwikowski [`github.com/y-o-o-z`](https://github.com/y-o-o-z) | modyfikacje forka Phantom, panel web |

## Czym Jest Phantom

Phantom to modularna sieć botów IRC z panelem webowym. Rdzeń bota jest napisany
w C++, a panel to aplikacja React + TypeScript obsługiwana przez proxy Bun,
które tłumaczy WebSocket na TCP/JSON WebAPI huba.

Architektura pozostaje zgodna z linią Psotnic:

```text
serwery IRC <-> boty leaf <-> boty slave <-> główny hub
                                                ^
                                                |
                                   listener JSON/TCP WebAPI
                                                |
                                      proxy WebSocket Bun
                                                |
                                           panel web
```

## Szybki Start

Kompilacja rdzenia:

```bash
./configure
make
make modules
```

Instalacja:

```bash
make install
```

Utworzenie konfiguracji:

```bash
cd ~/phantom
./phantom -n
```

Uruchomienie:

```bash
./phantom bot.cfg
```

Przykładowy hub z WebAPI powinien mieć listener dostępny lokalnie dla proxy:

```text
listen 0.0.0.0 33100 bots
listen 0.0.0.0 33101 users
listen 127.0.0.1 5555 webapi
```

Nie wystawiaj `webapi` bezpośrednio do internetu. Publiczny dostęp powinien iść
przez panel/proxy oraz warstwę TLS i kontroli dostępu.

## Panel Web

```bash
cd webpanel
bun install
bun run proxy
bun run dev
```

Domyślnie proxy łączy się z hubem na `127.0.0.1:5555`, a WebSocket nasłuchuje
na porcie `8080`.

## Dokumentacja

- `README.md` - główny opis projektu po angielsku.
- `docs/WEBAPI_PROTOCOL.md` - protokół WebAPI.
- `docs/SZYBKI_START_PL.md` - starszy polski przewodnik startowy.
- `docs/DOKUMENTACJA_PL.md` - starsza polska dokumentacja użytkownika.
- `docs/KOMENDY_PARTYLINE_PL.md` - komendy partyline.
- `docs/wiki/` - historyczne lustro wiki Psotnic.

Starsze polskie dokumenty mogą nadal używać nazw `Psotnic` albo `psotnic` w
historycznych przykładach. Dla bieżącej publicznej wersji projektu nazwą
programu i katalogu instalacyjnego jest `phantom`.

## Licencja

Phantom dziedziczy linię licencyjną Psotnic/gay-psotnic i jest dystrybuowany na
warunkach GPL-2.0. Wiele oryginalnych plików Psotnic/gay-psotnic ma nagłówki
GPL-2.0-or-later, ale dołączone komponenty takie jak FireDNS/FireString mają
nagłówki GPL-2.0-only; całe publiczne repozytorium traktuj jako GPL-2.0. Pełny
tekst licencji znajduje się w `COPYRIGHT.GPL`.
