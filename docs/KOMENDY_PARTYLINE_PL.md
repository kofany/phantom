# Lista komend Partyline - Psotnic

Kompletny przewodnik po komendach dostępnych w interfejsie partyline.

## Spis treści

1. [Informacje podstawowe](#informacje-podstawowe)
2. [Zarządzanie botami](#zarządzanie-botami)
3. [Zarządzanie użytkownikami](#zarządzanie-użytkownikami)
4. [Zarządzanie kanałami](#zarządzanie-kanałami)
5. [Listy ochronne](#listy-ochronne)
6. [Konfiguracja](#konfiguracja)
7. [Moduły](#moduły)
8. [Informacje i diagnostyka](#informacje-i-diagnostyka)
9. [System i administracja](#system-i-administracja)

---

## Informacje podstawowe

### Konwencje

- `<wymagane>` - Parametr wymagany
- `[opcjonalne]` - Parametr opcjonalny
- `<a|b>` - Wybór jednej z opcji
- `...` - Można powtórzyć

### Dostęp

Komendy wymagają odpowiednich flag w userlist:
- **+P** - Dostęp do partyline
- **+n** - Administracja (dodawanie/usuwanie użytkowników, zmiana flag)
- **+m** - Master (zarządzanie botami)
- **+H** - Hub (pełny dostęp, właściciel botnetu)

---

## Zarządzanie botami

### .bots
```
.bots
```
**Opis**: Wyświetla listę wszystkich botów online w sieci.

**Przykład**:
```
> .bots
[12:34:56] Bots online: 3
[12:34:56]   MainBot (MAIN)
[12:34:56]   SlaveBot1 (SLAVE) [linked to MainBot]
[12:34:56]   LeafBot1 (LEAF) [linked to SlaveBot1]
```

---

### .bottree
```
.bottree
```
**Opis**: Wyświetla drzewo hierarchii botów (topologię botnetu).

**Przykład**:
```
> .bottree
[12:34:56] Bot tree:
[12:34:56] MainBot (MAIN)
[12:34:56]  ├── SlaveBot1 (SLAVE)
[12:34:56]  │   └── LeafBot1 (LEAF)
[12:34:56]  └── SlaveBot2 (SLAVE)
```

---

### .bc
```
.bc <bot> <komenda> [argumenty]
```
**Opis**: Wykonuje komendę na zdalnym bocie (broadcast command).

**Przykłady**:
```
.bc MainBot status          # Status głównego bota
.bc * bots                  # Komenda "bots" na wszystkich botach
.bc SlaveBot1 die           # Zamknięcie SlaveBot1
.bc MainBot cfg nick        # Wyświetl konfigurację nick
```

**Najczęstsze komendy bc**:
- `status` - Status bota
- `die` - Zamknięcie bota
- `restart` - Restart bota
- `update [id:pw]` - Aktualizacja bota
- `stopupdate` - Zatrzymanie aktualizacji
- `jump <nr>` - Zmiana serwera IRC
- `raw <komenda>` - Surowa komenda IRC
- `names <#kanał>` - Lista nicków na kanale
- `cwho <#kanał>` - Szczegółowa lista użytkowników
- `cfg [opcja] [wartość]` - Konfiguracja
- `save` - Zapis konfiguracji
- `loadmod <ścieżka>` - Załadowanie modułu
- `unloadmod <moduł>` - Wyładowanie modułu
- `listmod` - Lista modułów

---

## Zarządzanie użytkownikami

### .+user
```
.+user <handle> <hostmask>
```
**Opis**: Dodaje nowego użytkownika do userlist.

**Wymagane flagi**: +n (admin)

**Przykłady**:
```
.+user JanKowalski jan!*@*.example.com
.+user Bot2 bot2!bot@192.168.1.100
```

**Uwagi**:
- Handle musi mieć 1-9 znaków
- Hostmask w formacie: `nick!ident@host`
- Można używać wildcard'ów: `*`, `?`

---

### .-user
```
.-user <handle>
```
**Opis**: Usuwa użytkownika z userlist.

**Wymagane flagi**: +n (admin)

**Przykład**:
```
.-user JanKowalski
```

---

### .chattr
```
.chattr <handle> <flagi> [kanał]
```
**Opis**: Zmienia flagi użytkownika.

**Wymagane flagi**: +n (admin)

**Składnia flag**:
- `+<flaga>` - Dodaj flagę
- `-<flaga>` - Usuń flagę
- Brak prefiksu - Ustaw dokładnie te flagi

**Flagi globalne**:
- `+H` - Hub (właściciel botnetu)
- `+P` - Party (dostęp do partyline)
- `+S` - Share (może łączyć się z botnetem)
- `+b` - Bot
- `+L` - Leaf bot
- `+n` - Admin
- `+m` - Master
- `+d` - Deny (zbanowany)

**Flagi kanałowe**:
- `+o` - Op
- `+v` - Voice
- `+f` - Friend
- `+a` - Auto-op
- `+l` - Lamer (auto-kick)

**Przykłady**:
```
.chattr JanKowalski +o #testbot       # Dodaj +o na #testbot
.chattr JanKowalski -o #testbot       # Usuń +o na #testbot
.chattr JanKowalski +no               # Dodaj +n globalnie, +o globalnie
.chattr JanKowalski +af #testbot      # Dodaj +a i +f na #testbot
.chattr Bot2 +PSb                     # Bot SLAVE
.chattr Bot3 +LSb                     # Bot LEAF
```

---

### .+addr
```
.+addr <handle> <adres_ip>
```
**Opis**: Dodaje dozwolony adres IP dla użytkownika (ogranicza dostęp do partyline).

**Wymagane flagi**: +n

**Przykłady**:
```
.+addr JanKowalski 192.168.1.100
.+addr JanKowalski 192.168.1.0/24       # CIDR notation
.+addr JanKowalski 2001:db8::1
```

**Uwaga**: Po użyciu `.+addr`, użytkownik może łączyć się TYLKO z określonych IP.

---

### .-addr
```
.-addr <handle> <adres_ip>
```
**Opis**: Usuwa dozwolony adres IP.

**Przykład**:
```
.-addr JanKowalski 192.168.1.100
```

---

### .+host
```
.+host <handle> <hostmask>
```
**Opis**: Dodaje dodatkową hostmaskę dla użytkownika.

**Przykład**:
```
.+host JanKowalski jan!*@*.other.com
```

---

### .-host
```
.-host <handle> <hostmask>
```
**Opis**: Usuwa hostmaskę użytkownika.

**Przykład**:
```
.-host JanKowalski jan!*@*.other.com
```

---

### .passwd
```
.passwd <stare_hasło> <nowe_hasło>
```
**Opis**: Zmienia własne hasło.

**Przykład**:
```
.passwd stare123 nowe456
```

---

### .chpass
```
.chpass <handle> <nowe_hasło>
```
**Opis**: Zmienia hasło innego użytkownika.

**Wymagane flagi**: +n lub +H

**Przykład**:
```
.chpass JanKowalski nowehaslo123
```

---

### .match
```
.match <maska>
```
**Opis**: Sprawdza czy maska pasuje do jakiegoś użytkownika w userlist.

**Przykład**:
```
> .match jan!*@*.example.com
[12:34:56] Matched: JanKowalski (+no #testbot)
```

---

### .list
```
.list [flagi]
```
**Opis**: Wyświetla listę użytkowników z userlist.

**Filtry**:
- `a` - Auto-op
- `b` - Boty
- `d` - Deny (zbanowani)
- `f` - Friend
- `m` - Master
- `n` - Admin
- `o` - Op
- `v` - Voice

**Przykłady**:
```
.list           # Wszyscy użytkownicy
.list b         # Tylko boty
.list n         # Tylko adminowie
.list o         # Użytkownicy z +o
```

---

## Zarządzanie kanałami

### .+chan
```
.+chan <#kanał> [opcje]
```
**Opis**: Dodaje kanał do autojoin.

**Wymagane flagi**: +n lub +m

**Przykład**:
```
.+chan #testbot
.+chan #sekretny haslo123    # Kanał z kluczem
```

---

### .-chan
```
.-chan <#kanał>
```
**Opis**: Usuwa kanał z autojoin.

**Przykład**:
```
.-chan #testbot
```

---

### .chanset
```
.chanset <#kanał> [opcja] [wartość]
```
**Opis**: Wyświetla lub zmienia ustawienia kanału.

**Bez argumentów**: Wyświetla wszystkie ustawienia kanału.

**Główne opcje chanset**:

#### Ogólne
- `autoop` (ON/OFF) - Automatyczne op dla użytkowników z +o
- `bitch` (ON/OFF) - Tylko boty mogą mieć OP
- `enforce-bans` (ON/OFF) - Wymuszanie banów
- `enforce-limits` (ON/OFF) - Wymuszanie limitu
- `modelock` - Blokada trybów kanału

#### Ochrona
- `clonecheck` (0-99) - Sprawdzanie klonów (max dozwolone)
- `limit` (0-999999) - Limit użytkowników (0 = off)
- `limit-offset` (0-999) - Offset limitu (limit = users + offset)
- `dynamic-bans` (ON/OFF) - Dynamiczne bany
- `dynamic-exempts` (ON/OFF) - Dynamiczne wyjątki
- `dynamic-invites` (ON/OFF) - Dynamiczne zaproszenia

#### Keepout i ochrona
- `keepout` - Maska użytkowników do wyrzucenia
- `guardian` (0-99) - Liczba botów do ochrony kanału

#### Powody (reasons)
- `kick-reason` - Powód kicka
- `part-reason` - Powód part
- `cycle-reason` - Powód cycle

**Przykłady**:
```
.chanset #testbot                          # Wyświetl ustawienia
.chanset #testbot autoop ON                # Włącz autoop
.chanset #testbot limit 50                 # Ustaw limit na 50
.chanset #testbot limit-offset 5           # Limit = users + 5
.chanset #testbot enforce-bans ON          # Wymuszaj bany
.chanset #testbot modelock +nt             # Zablokuj tryby +nt
.chanset #testbot keepout *!*@*.spam.com   # Keepout dla spamerów
.chanset #testbot kick-reason Spam!        # Powód kicka
```

---

### .cycle
```
.cycle <#kanał>
```
**Opis**: Opuszcza i ponownie wchodzi na kanał.

**Przykład**:
```
.cycle #testbot
```

---

## Listy ochronne

### .+ban
```
.+ban <maska> <#kanał> [czas] [powód]
```
**Opis**: Dodaje bana do listy ochronnej kanału.

**Wymagane flagi**: +o lub wyżej

**Parametry**:
- `maska` - Ban w formacie nick!ident@host
- `#kanał` - Nazwa kanału
- `czas` - Czas trwania (np. 1h, 2d, 1w) lub 0 (permanentny)
- `powód` - Opcjonalny powód

**Przykłady**:
```
.+ban *!*@*.spam.com #testbot 0 Spamer
.+ban badnick!*@* #testbot 1h Timeout
.+ban *!badident@* #testbot 2d Flood
```

**Jednostki czasu**:
- `s` - sekundy
- `m` - minuty
- `h` - godziny
- `d` - dni
- `w` - tygodnie

---

### .-ban
```
.-ban <maska> <#kanał>
```
**Opis**: Usuwa bana z listy ochronnej.

**Przykład**:
```
.-ban *!*@*.spam.com #testbot
```

---

### .+exempt
```
.+exempt <maska> <#kanał> [czas] [powód]
```
**Opis**: Dodaje exempt (wyjątek od bana).

**Przykład**:
```
.+exempt *!*@*.trusted.com #testbot 0 Trusted users
```

---

### .-exempt
```
.-exempt <maska> <#kanał>
```
**Opis**: Usuwa exempt.

---

### .+invite
```
.+invite <maska> <#kanał> [czas] [powód]
```
**Opis**: Dodaje auto-invite (automatyczne zaproszenie).

**Przykład**:
```
.+invite *!*@*.vip.com #sekretny 0 VIP users
```

---

### .-invite
```
.-invite <maska> <#kanał>
```
**Opis**: Usuwa auto-invite.

---

### .+reop
```
.+reop <maska> <#kanał> [czas] [powód]
```
**Opis**: Dodaje reop (automatyczne przywrócenie OP).

**Przykład**:
```
.+reop bot2!*@* #testbot 0 Trusted bot
```

---

### .-reop
```
.-reop <maska> <#kanał>
```
**Opis**: Usuwa reop.

---

## Konfiguracja

### .set
```
.set [opcja] [wartość]
```
**Opis**: Wyświetla lub zmienia globalne ustawienia bota.

**Bez argumentów**: Wyświetla wszystkie ustawienia.

**Główne opcje**:

#### IRC
- `nick` - Nick bota
- `altnick` - Alternatywny nick
- `ident` - Ident bota
- `realname` - Realname bota
- `quit-reason` - Powód quit
- `part-reason` - Powód part
- `cycle-reason` - Powód cycle
- `rejoin-after-kick-delay` (1-3600s) - Opóźnienie rejoin po kick

#### Partyline
- `partyline-servername` - Nazwa serwera w partyline

#### Połączenia
- `conn-timeout` (30-3600s) - Timeout połączenia
- `hub-conn-delay` (10-3600s) - Opóźnienie połączenia z hub
- `irc-conn-delay` (10-3600s) - Opóźnienie połączenia z IRC

#### Lag i performance
- `lag-check-time` (60-3600s) - Częstotliwość sprawdzania lag
- `penalty` (0/1) - Włącz/wyłącz penalty system

#### DNS (jeśli ADNS)
- `resolve-users-hostname` (ON/OFF) - Rozwiązywanie hostname użytkowników
- `resolve-threads` (1-10) - Liczba wątków DNS
- `domain-ttl` (60-86400s) - TTL cache DNS

#### Bezpieczeństwo
- `allow-set-pass-by-msg` (ON/OFF) - Pozwól zmianę hasła przez msg

**Przykłady**:
```
.set                                    # Wszystkie ustawienia
.set quit-reason                        # Wyświetl quit-reason
.set quit-reason Bot restarting         # Ustaw quit-reason
.set rejoin-after-kick-delay 30         # 30 sekund opóźnienia
.set lag-check-time 120                 # Sprawdzaj lag co 2 min
.set resolve-users-hostname ON          # Włącz DNS resolve
```

---

### .mk
```
.mk [klucz] [wartość]
```
**Opis**: Wyświetla lub zmienia ustawienia modułów.

**Zależy od załadowanych modułów**.

---

## Moduły

### .bc <bot> loadmod
```
.bc <bot> loadmod <pełna_ścieżka>
```
**Opis**: Ładuje moduł na bocie.

**Przykład**:
```
.bc MainBot loadmod /home/user/psotnic/modules/vctrl.so
```

**Uwaga**: Zawsze używaj pełnej ścieżki!

---

### .bc <bot> unloadmod
```
.bc <bot> unloadmod <nazwa_modułu>
```
**Opis**: Wyładowuje moduł z bota.

**Przykład**:
```
.bc MainBot unloadmod vctrl
```

---

### .bc <bot> listmod
```
.bc <bot> listmod
```
**Opis**: Wyświetla listę załadowanych modułów.

**Przykład**:
```
> .bc MainBot listmod
[12:34:56] Loaded modules on MainBot:
[12:34:56]   vctrl v1.0 by patrick <patrick@psotnic.com>
[12:34:56]   spam v1.0 by patrick <patrick@psotnic.com>
```

---

## Informacje i diagnostyka

### .bc <bot> status
```
.bc <bot> status
```
**Opis**: Wyświetla szczegółowy status bota.

**Informacje**:
- Wersja bota
- Uptime (czas działania)
- Status połączenia z IRC
- Serwer IRC
- Lag
- Liczba kanałów
- Zużycie pamięci
- Limit core file
- Obsługa modułów

**Przykład**:
```
> .bc MainBot status
[12:34:56] Status of MainBot:
[12:34:56]   Version: psotnic-0.2.14-GIT
[12:34:56]   Uptime: 2 days, 5 hours, 23 minutes
[12:34:56]   IRC: Connected to irc.libera.chat:6667
[12:34:56]   Nick: MainBot
[12:34:56]   Current lag: 0.234s
[12:34:56]   Channels: 3
[12:34:56]   Memory: 4.2 MB
[12:34:56]   Core limit: unlimited
[12:34:56]   Modules: enabled (2 loaded)
```

---

### .bc <bot> names
```
.bc <bot> names <#kanał>
```
**Opis**: Wyświetla listę nicków na kanale.

**Przykład**:
```
.bc MainBot names #testbot
```

---

### .bc <bot> cwho
```
.bc <bot> cwho <#kanał> [filtr]
```
**Opis**: Wyświetla szczegółową listę użytkowników na kanale.

**Filtry**:
- `o` - Tylko opy
- `v` - Tylko voice
- `b` - Tylko boty
- `l` - Tylko lamerzy

**Przykład**:
```
> .bc MainBot cwho #testbot
[12:34:56] Channel #testbot on MainBot:
[12:34:56]   @JanKowalski (jan!~jan@host.example.com) [+o]
[12:34:56]   +UserVoice (user!~user@1.2.3.4) [+v]
[12:34:56]   NormalUser (normal!~norm@host2.com) []

> .bc MainBot cwho #testbot o
[12:34:56] Ops on #testbot:
[12:34:56]   @JanKowalski (jan!~jan@host.example.com)
```

---

### .bc <bot> cfg
```
.bc <bot> cfg [sekcja]
```
**Opis**: Wyświetla konfigurację bota.

**Sekcje**:
- (brak) - Cała konfiguracja
- `nick` - Nick i ident
- `server` - Lista serwerów
- `hub` - Lista hubów
- `listen` - Porty nasłuchiwania
- `channel` - Lista kanałów
- `ownerpass` - Lista ownerpass

**Przykład**:
```
> .bc MainBot cfg server
[12:34:56] IRC servers on MainBot:
[12:34:56]   1. irc.libera.chat:6667
[12:34:56]   2. irc.oftc.net:6667
```

---

### .bc <bot> cfg +/-
```
.bc <bot> cfg +<sekcja> <wartość>
.bc <bot> cfg -<sekcja> <wartość>
```
**Opis**: Dodaje (+) lub usuwa (-) wpis w konfiguracji.

**Przykłady**:
```
.bc MainBot cfg +server irc.example.com 6667
.bc MainBot cfg -server irc.old.com 6667
.bc MainBot cfg +channel #newchan
.bc MainBot cfg -channel #oldchan
.bc MainBot cfg +ownerpass nowehaslo
.bc MainBot cfg nick NowyNick
```

---

### .bc <bot> save
```
.bc <bot> save
```
**Opis**: Zapisuje konfigurację bota do pliku.

**Przykład**:
```
.bc MainBot save
```

---

## System i administracja

### .bc <bot> die
```
.bc <bot> die [powód]
```
**Opis**: Zamyka bota.

**Wymagane flagi**: +m lub +H

**Przykład**:
```
.bc MainBot die Maintenance
```

---

### .bc <bot> restart
```
.bc <bot> restart [powód]
```
**Opis**: Restartuje bota (zamyka i uruchamia ponownie).

**Przykład**:
```
.bc MainBot restart Configuration update
```

---

### .bc <bot> update
```
.bc <bot> update [id:hasło]
```
**Opis**: Aktualizuje bota do najnowszej wersji.

**Parametry opcjonalne**:
- `id:hasło` - Autentykacja do serwera aktualizacji (jeśli wymagana)

**Przykład**:
```
.bc MainBot update
.bc MainBot update user:pass123
```

**Uwaga**: Wymaga skonfigurowanego serwera aktualizacji.

---

### .bc <bot> stopupdate
```
.bc <bot> stopupdate
```
**Opis**: Zatrzymuje trwającą aktualizację.

---

### .bc <bot> jump
```
.bc <bot> jump <numer>
```
**Opis**: Przełącza bota na inny serwer IRC z listy.

**Przykład**:
```
> .bc MainBot cfg server
[12:34:56] 1. irc.libera.chat:6667
[12:34:56] 2. irc.oftc.net:6667

> .bc MainBot jump 2
[12:34:57] Switching to server #2
```

---

### .bc <bot> raw
```
.bc <bot> raw <komenda_irc>
```
**Opis**: Wysyła surową komendę IRC.

**Przykłady**:
```
.bc MainBot raw NICK NowyNick
.bc MainBot raw PRIVMSG #testbot :Hello from partyline!
.bc MainBot raw MODE #testbot +m
```

**Uwaga**: Używaj ostrożnie, złe komendy mogą rozłączyć bota!

---

### .help
```
.help [komenda]
```
**Opis**: Wyświetla pomoc.

**Przykłady**:
```
.help                # Lista wszystkich komend
.help +user          # Pomoc dla komendy +user
```

---

### .quit
```
.quit
```
**Opis**: Rozłącza Cię z partyline.

---

### .su
```
.su <handle>
```
**Opis**: Przełącza się na inny handle (switch user).

**Wymagane**:
- Musisz znać hasło tego użytkownika
- Lub mieć flagę +H

**Przykład**:
```
.su JanKowalski
Password: ********
```

---

## Komendy specjalne (moduły)

Następujące komendy są dostępne gdy odpowiednie moduły są załadowane:

### VCTRL (Voice Control)

```
.bc <bot> vset [klucz] [wartość]
```
Konfiguracja globalna vctrl.

```
.bc <bot> vchanset <#kanał> [klucz] [wartość]
```
Konfiguracja vctrl dla kanału.

**Kluczowe opcje**:
- `voicecontrol` (ON/OFF) - Włącz/wyłącz
- `max-delay` (0-60) - Losowe opóźnienie
- `ban-type` - Format banu (np. `*!%i@%h`)
- `notice` (ON/OFF) - Powiadomienia

**Przykład**:
```
.bc MainBot vset max-delay 10
.bc MainBot vchanset #testbot voicecontrol ON
.bc MainBot vchanset #testbot ban-type *!*@%h
```

---

## Tabela skrótów i aliasów

Niektóre komendy mają krótsze aliasy:

| Pełna komenda | Alias | Opis |
|---------------|-------|------|
| `.bots` | - | Lista botów |
| `.bottree` | - | Drzewo botów |
| `.list` | `.ls` | Lista użytkowników |
| `.+user` | - | Dodaj użytkownika |
| `.-user` | - | Usuń użytkownika |
| `.chattr` | `.attr` | Zmień flagi |
| `.+chan` | - | Dodaj kanał |
| `.-chan` | - | Usuń kanał |
| `.chanset` | `.cs` | Ustawienia kanału |

---

## Przykładowe scenariusze

### Scenariusz 1: Dodanie nowego admina

```
# 1. Dodaj użytkownika
.+user NowyAdmin admin!*@*.trusted.com

# 2. Nadaj uprawnienia
.chattr NowyAdmin +Pn

# 3. Nadaj OP na kanałach
.chattr NowyAdmin +ao #testbot
.chattr NowyAdmin +ao #main

# 4. Ustaw hasło
.chpass NowyAdmin bezpiecznehaslo123

# 5. Dodaj dozwolone IP (opcjonalnie)
.+addr NowyAdmin 192.168.1.50
```

---

### Scenariusz 2: Konfiguracja nowego kanału

```
# 1. Dodaj kanał
.+chan #newchan

# 2. Skonfiguruj podstawy
.chanset #newchan autoop ON
.chanset #newchan enforce-bans ON
.chanset #newchan limit 100
.chanset #newchan limit-offset 10

# 3. Ustaw modelock
.chanset #newchan modelock +nt-s

# 4. Ustaw powody
.chanset #newchan kick-reason Spam/Flood
.chanset #newchan part-reason Leaving

# 5. Dodaj keepout (jeśli potrzeba)
.chanset #newchan keepout *!*@*.spam.com
```

---

### Scenariusz 3: Dodanie bota SLAVE

```
# Na MAIN:
# 1. Dodaj bota do userlist
.+user SlaveBot2 192.168.1.200
.chattr SlaveBot2 +PSb

# 2. Ustaw hasło (będzie potrzebne w konfiguracji SLAVE)
.chpass SlaveBot2 tajnehaslo123

# Na SLAVE:
# - Podczas tworzenia konfiguracji podaj:
#   - Hub IP: 192.168.1.1 (IP MAIN)
#   - Hub Port: 9000
#   - Hub Password: tajnehaslo123
#   - Hub Handle: MainBot
```

---

### Scenariusz 4: Masowe operacje

```
# Op wszystkich zaufanych użytkowników na #testbot
.chattr * +o #testbot

# Usuń voice ze wszystkich
.chattr * -v #testbot

# Broadcast komendy na wszystkie boty
.bc * status

# Restart wszystkich botów
.bc * restart Update

# Załaduj moduł na wszystkich botach
.bc * loadmod /home/user/psotnic/modules/spam.so
```

---

## Wskazówki i najlepsze praktyki

### 1. Bezpieczeństwo

✅ **DOBRZE**:
```
.+addr Admin 192.168.1.0/24    # Ogranicz dostęp według IP
.chattr * -d                   # Usuń flagę deny dla wszystkich
```

❌ **ŹLE**:
```
.chattr * +H                   # NIE dawaj wszystkim +H!
.+user test *!*@*              # Zbyt szeroka maska
```

### 2. Organizacja

- Używaj sensownych nazw handle (nie "user1", "user2")
- Grupuj użytkowników według ról
- Dokumentuj zmiany (np. w notatkach)

### 3. Wydajność

- Nie używaj `.bc *` dla ciężkich operacji
- Ogranicz liczbę botów na jednym serwerze
- Używaj opóźnień w modułach

### 4. Backup

Regularnie wykonuj backup:
```bash
# Poza partyline, w shellu:
cp userlist.txt userlist-backup-$(date +%Y%m%d).txt
```

---

## Podsumowanie

**Najważniejsze komendy**:
1. `.bots` - Sprawdź sieć botów
2. `.bc <bot> status` - Status bota
3. `.+user` / `.chattr` - Zarządzanie użytkownikami
4. `.chanset` - Konfiguracja kanałów
5. `.set` - Globalne ustawienia
6. `.bc <bot> cfg` - Konfiguracja bota

**Pamiętaj**:
- Zawsze używaj pełnych ścieżek dla modułów
- Zapisuj konfigurację: `.bc <bot> save`
- Twórz backup przed wielkimi zmianami
- Testuj na jednym bocie przed `.bc *`

---

**Wersja**: 1.0  
**Data**: 2025  
**Zobacz też**: 
- DOKUMENTACJA_PL.md
- SZYBKI_START_PL.md
- ARCHITEKTURA_TECHNICZNA_PL.md

*Koniec listy komend partyline*
