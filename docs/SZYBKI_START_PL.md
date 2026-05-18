# Psotnic - Szybki start

Ten dokument przeprowadzi Cię przez proces od kompilacji do uruchomienia pierwszego bota Psotnic w 15 minut.

## Spis treści

1. [Wymagania](#wymagania)
2. [Instalacja krok po kroku](#instalacja-krok-po-kroku)
3. [Pierwsze uruchomienie](#pierwsze-uruchomienie)
4. [Podstawowa konfiguracja](#podstawowa-konfiguracja)
5. [Rozbudowa do sieci botów](#rozbudowa-do-sieci-botów)
6. [Najczęstsze problemy](#najczęstsze-problemy)

---

## Wymagania

### Minimalne wymagania

- **System**: Linux (Ubuntu, Debian, CentOS, etc.)
- **Kompilator**: g++ 
- **RAM**: 32 MB
- **Dysk**: 50 MB
- **Dostęp**: SSH do serwera

### Opcjonalne (zalecane)

- OpenSSL (dla połączeń SSL)
- Screen lub tmux (do utrzymania sesji)

### Sprawdzenie wymagań

```bash
# Sprawdź g++
g++ --version

# Sprawdź OpenSSL (opcjonalnie)
openssl version

# Sprawdź dostępność screen
screen --version
```

---

## Instalacja krok po kroku

### Krok 1: Pobranie źródeł

```bash
# Przejdź do katalogu domowego
cd ~

# Sklonuj repozytorium (lub wypakuj archiwum)
# git clone https://github.com/psotnic/psotnic-ng.git
# lub:
# tar xvzf psotnic-X.X.X.tar.gz

cd psotnic
```

### Krok 2: Konfiguracja

```bash
./configure
```

**Domyślne ustawienia**:
- Katalog instalacji: `$HOME/psotnic`
- Włączone: SSL (jeśli dostępne), ADNS, moduły

**Opcje zaawansowane**:
```bash
# Własny katalog instalacji
./configure --prefix=$HOME/moj-bot

# Bez obsługi modułów (mniejszy rozmiar)
./configure --disable-modules

# Z debugowaniem
./configure --enable-debug
```

### Krok 3: Kompilacja

```bash
# Kompilacja głównego programu
make

# Kompilacja modułów (opcjonalnie)
make modules
```

**Oczekiwany wynik**:
```
[OK] Compiled: psotnic
[OK] Compiled: modules/vctrl.so
[OK] Compiled: modules/spam.so
...
```

### Krok 4: Instalacja

```bash
make install
```

Pliki zostaną skopiowane do `$HOME/psotnic/` (lub innego katalogu wybranego w configure).

### Krok 5: Przejście do katalogu instalacji

```bash
cd $HOME/psotnic
ls -la
```

Powinieneś zobaczyć:
- `psotnic` (lub `phantom`) - główny plik wykonywalny
- `modules/` - katalog z modułami .so

---

## Pierwsze uruchomienie

### Krok 1: Tworzenie konfiguracji

```bash
./psotnic -n
```

Uruchomi się **interaktywny kreator konfiguracji**. Odpowiedz na pytania:

#### 1. Typ bota

```
Bot type (MAIN/SLAVE/LEAF) [MAIN]:
```
**Odpowiedź**: Naciśnij Enter (wybierz MAIN)

#### 2. Handle bota

```
Bot handle (1-9 chars):
```
**Odpowiedź**: `MojBot` (może być dowolna nazwa, np. Bot1, Psotnik, etc.)

#### 3. Serwer IRC

```
IRC server configuration:
  Host address:
```
**Odpowiedź**: `irc.libera.chat` (lub inny serwer IRC)

```
  Port number [6667]:
```
**Odpowiedź**: Naciśnij Enter (domyślnie 6667)

```
  Password []:
```
**Odpowiedź**: Naciśnij Enter (większość serwerów nie wymaga hasła)

#### 4. Nick bota

```
Nick [MojBot]:
```
**Odpowiedź**: `MojBot` (lub inny nick)

```
Alternative nick [MojBot_]:
```
**Odpowiedź**: Naciśnij Enter

#### 5. Ident i Realname

```
Ident [psotnic]:
```
**Odpowiedź**: Naciśnij Enter

```
Realname [psotnic bot]:
```
**Odpowiedź**: Naciśnij Enter

#### 6. Kanały

```
Channel [#psotnic]:
```
**Odpowiedź**: `#testbot` (lub inny kanał, na którym masz OP)

**Możesz dodać więcej kanałów**:
```
Do you want to add another channel? (yes/no) [no]:
```
**Odpowiedź**: `no`

#### 7. Konto właściciela

```
Owner account:
  Handle (1-9 chars):
```
**Odpowiedź**: `Admin` (Twój handle w userlist)

```
  Hostmask:
```
**Odpowiedź**: `*!*@*.example.com` (Twoja maska, np. `*!*@192.168.1.*`)

**Jak sprawdzić swoją maskę?**
- Wejdź na IRC i użyj `/whois TwojNick`
- Zamień części na wildcards, np. `jan!~jan@host-192-168-1-100.example.com` → `*!*@*.example.com`

```
  Password:
```
**Odpowiedź**: Wpisz silne hasło (minimum 8 znaków)

#### 8. Hasło właściciela (ownerpass)

```
Owner password (for partyline access):
```
**Odpowiedź**: Wpisz hasło (może być takie samo jak powyżej lub inne)

#### 9. Port nasłuchiwania

```
Listen port configuration:
  IP address [0.0.0.0]:
```
**Odpowiedź**: Naciśnij Enter (nasłuchuj na wszystkich interfejsach)

```
  Port [9000]:
```
**Odpowiedź**: Naciśnij Enter (lub wybierz inny port, np. 9001)

```
  Type (all/users/bots) [all]:
```
**Odpowiedź**: `all`

#### 10. Podsumowanie i zapis

```
Configuration complete. Save to file? (yes/no) [yes]:
```
**Odpowiedź**: `yes`

```
Configuration filename [bot.cfg]:
```
**Odpowiedź**: Naciśnij Enter (lub wpisz inną nazwę)

**Gotowe!** Plik konfiguracyjny został utworzony.

### Krok 2: Uruchomienie bota

```bash
./psotnic bot.cfg
```

**Oczekiwany wynik**:
```
[*] Loading userlist from userlist.txt
[+] Userlist loaded (ts: 1234567890, sn: 1)
[*] Connecting to irc.libera.chat:6667
[+] Connected to IRC
[+] Registered on IRC as MojBot
[+] Joined #testbot
```

Bot automatycznie przechodzi w tryb daemon (w tle). **Gratulacje!** Twój bot działa.

### Krok 3: Sprawdzenie statusu

Wejdź na IRC na kanał `#testbot` i zobaczysz swojego bota.

---

## Podstawowa konfiguracja

### Połączenie z Partyline

Partyline to interfejs kontrolny bota. Możesz połączyć się z nim przez:

#### Metoda 1: Telnet

```bash
telnet localhost 9000
```

**Logowanie**:
```
<hasło_owner>:<Twój_handle>:<Twoje_hasło>
```

Przykład:
```
ownerpass123:Admin:mojehaslo
```

Jeśli wszystko jest OK, zobaczysz:
```
*** Welcome to Psotnic partyline ***
[00:00:00] Connected to: MojBot
>
```

#### Metoda 2: IRC Client

```
/server localhost 9000 ownerpass123:Admin:mojehaslo
```

### Podstawowe komendy Partyline

Po połączeniu z partyline możesz używać komend:

#### Sprawdzenie botów w sieci

```
.bots
```

Wynik:
```
[00:00:01] Bots online: 1
[00:00:01]   MojBot (MAIN)
```

#### Status bota

```
.bc MojBot status
```

Wynik pokazuje:
- Czas działania (uptime)
- Połączenie z IRC
- Liczba kanałów
- Lag
- Pamięć

#### Lista użytkowników

```
.list
```

Pokaże wszystkich użytkowników w userlist.

#### Dodanie użytkownika

```
.+user JanKowalski jan!*@*.example.com
.chattr JanKowalski +o #testbot
```

To doda użytkownika `JanKowalski` i nada mu OP na kanale #testbot.

#### Zmiana ustawień

```
.set
```

Pokaże wszystkie dostępne ustawienia.

```
.set <opcja> <wartość>
```

Przykład:
```
.set quit-reason "Bot offline"
```

#### Zarządzanie kanałami

```
.chanset #testbot
```

Pokaże ustawienia kanału.

```
.chanset #testbot <opcja> <wartość>
```

Przykład:
```
.chanset #testbot enforcebans ON
```

#### Pomoc

```
.help
.help <komenda>
```

### Ładowanie modułów

Aby załadować moduł (np. vctrl):

```
.bc MojBot loadmod /home/user/psotnic/modules/vctrl.so
```

**Ważne**: Użyj pełnej ścieżki do pliku .so!

Sprawdzenie załadowanych modułów:

```
.bc MojBot listmod
```

### Automatyczne ładowanie modułów

Edytuj konfigurację bota, aby moduły ładowały się automatycznie:

1. Zatrzymaj bota:
```
.bc MojBot die
```

2. Edytuj `bot.cfg` (wymaga deszyfrowania - najłatwiej dodać przez partyline):

```
.bc MojBot cfg +loadmodule /home/user/psotnic/modules/vctrl.so
.bc MojBot cfg +loadmodule /home/user/psotnic/modules/spam.so
```

3. Zapisz i zrestartuj:
```
.bc MojBot restart
```

---

## Rozbudowa do sieci botów

### Architektura

```
     [MAIN]
       |
    [SLAVE1]
       |
     [LEAF1]
```

### Konfiguracja MAIN (Hub)

Główny bot (już masz skonfigurowany jako MAIN).

**Dodaj boty do userlist** (na partyline MAIN):

```
.+user SlaveBot1 192.168.1.100
.chattr SlaveBot1 +PSb
.+user LeafBot1 192.168.1.101
.chattr LeafBot1 +LSb
```

Flagi:
- `+P` - SLAVE (może mieć własne boty)
- `+L` - LEAF (najniższy poziom)
- `+S` - Może linkować się
- `+b` - Bot

### Konfiguracja SLAVE

Utwórz nową konfigurację:

```bash
cd $HOME/psotnic
./psotnic -n
```

Różnice w konfiguracji:

1. **Typ bota**: `SLAVE`
2. **Handle**: `SlaveBot1`
3. **Hub**: 
   - Host: `192.168.1.1` (IP głównego bota)
   - Port: `9000` (port listen głównego bota)
   - Password: (hasło z userlist głównego bota - to co wpisałeś przy `.+user`)
   - Handle: `MojBot` (handle głównego bota)

Uruchom:

```bash
./psotnic slave.cfg
```

Bot SLAVE automatycznie połączy się z MAIN i otrzyma userlist.

### Sprawdzenie połączenia

Na partyline MAIN:

```
.bots
```

Powinieneś zobaczyć:
```
[00:00:01] Bots online: 2
[00:00:01]   MojBot (MAIN)
[00:00:01]   SlaveBot1 (SLAVE) [linked to MojBot]
```

### Drzewo botów

```
.bottree
```

Pokazuje hierarchię:
```
MojBot (MAIN)
 └── SlaveBot1 (SLAVE)
```

---

## Najczęstsze problemy

### Problem 1: Bot nie łączy się z IRC

**Objawy**:
```
[*] Connecting to irc.example.com:6667
[-] Connection failed
```

**Rozwiązania**:

1. **Sprawdź czy serwer działa**:
   ```bash
   telnet irc.example.com 6667
   ```

2. **Sprawdź firewall**:
   ```bash
   sudo iptables -L
   ```

3. **Zmień serwer** (na partyline):
   ```
   .bc MojBot cfg server
   .bc MojBot cfg +server irc.libera.chat 6667
   .bc MojBot jump 1
   ```

### Problem 2: Bot nie wchodzi na kanał

**Objawy**: Bot jest na IRC ale nie ma go na kanale.

**Rozwiązania**:

1. **Sprawdź czy kanał jest w konfiguracji**:
   ```
   .bc MojBot cfg channel
   ```

2. **Dodaj kanał**:
   ```
   .bc MojBot cfg +channel #testbot
   ```

3. **Sprawdź czy kanał wymaga invite**:
   - Jeśli tak, musisz zaprosić bota: `/invite MojBot #testbot`

4. **Sprawdź czy bot jest zbanowany**:
   - Na kanale: `/mode #testbot +b`

### Problem 3: Nie mogę połączyć się z partyline

**Objawy**:
```
telnet localhost 9000
Connection refused
```

**Rozwiązania**:

1. **Sprawdź czy bot działa**:
   ```bash
   ps aux | grep psotnic
   ```

2. **Sprawdź czy port nasłuchuje**:
   ```bash
   netstat -tlnp | grep 9000
   ```

3. **Sprawdź firewall** (jeśli łączysz się zdalnie):
   ```bash
   sudo ufw allow 9000
   ```

4. **Sprawdź IP listen** (może być `127.0.0.1` zamiast `0.0.0.0`):
   - Jeśli listen jest na `127.0.0.1`, możesz połączyć się tylko lokalnie

### Problem 4: Błędne hasło do partyline

**Objawy**:
```
[ERROR] Invalid password
```

**Rozwiązania**:

1. **Sprawdź składnię**:
   ```
   <ownerpass>:<handle>:<userpass>
   ```
   Wszystkie trzy części są wymagane!

2. **Sprawdź czy handle istnieje**:
   - Jeśli masz dostęp do serwera, możesz zrestartować bota i utworzyć konfigurację od nowa

3. **Reset hasła** (tylko jeśli masz dostęp do plików):
   ```bash
   mv userlist.txt userlist.txt.backup
   ./psotnic -n  # Utwórz nową konfigurację
   ```

### Problem 5: Bot nie synchronizuje userlist

**Objawy**: SLAVE nie otrzymuje userlist od MAIN.

**Rozwiązania**:

1. **Sprawdź połączenie botnet**:
   ```
   .bots
   ```

2. **Sprawdź uprawnienia** (na MAIN):
   ```
   .match SlaveBot1
   ```
   Powinno pokazać `+PSb`.

3. **Wymuś synchronizację**:
   ```
   .bc SlaveBot1 resync
   ```

4. **Sprawdź hasło botnet**:
   - Hasło w konfiguracji SLAVE musi odpowiadać hasłu użytkownika w MAIN

### Problem 6: Moduł nie ładuje się

**Objawy**:
```
[-] Cannot load module: /path/to/module.so
```

**Rozwiązania**:

1. **Sprawdź ścieżkę** (musi być pełna):
   ```bash
   ls -la /home/user/psotnic/modules/vctrl.so
   ```

2. **Sprawdź uprawnienia**:
   ```bash
   chmod 755 /home/user/psotnic/modules/vctrl.so
   ```

3. **Sprawdź czy plik jest biblioteką**:
   ```bash
   file /home/user/psotnic/modules/vctrl.so
   ```
   Powinno pokazać: `ELF 64-bit LSB shared object`

4. **Sprawdź zależności**:
   ```bash
   ldd /home/user/psotnic/modules/vctrl.so
   ```

### Problem 7: Bot zużywa dużo CPU

**Rozwiązania**:

1. **Sprawdź logi** - może być flood na kanale
2. **Zwiększ opóźnienia w modułach**:
   ```
   .bc MojBot vset max-delay 15
   ```
3. **Wyłącz nieużywane moduły**:
   ```
   .bc MojBot unloadmod spam
   ```

---

## Następne kroki

Po pomyślnym uruchomieniu bota:

1. **Przeczytaj pełną dokumentację**: [DOKUMENTACJA_PL.md](DOKUMENTACJA_PL.md)
2. **Zapoznaj się z architekturą**: [ARCHITEKTURA_TECHNICZNA_PL.md](ARCHITEKTURA_TECHNICZNA_PL.md)
3. **Skonfiguruj moduły** według swoich potrzeb
4. **Regularnie twórz backup** userlist:
   ```bash
   cp userlist.txt userlist.txt.backup-$(date +%Y%m%d)
   ```
5. **Monitoruj bota** używając screen/tmux:
   ```bash
   screen -S psotnic
   ./psotnic bot.cfg
   # Ctrl+A, D (detach)
   # screen -r psotnic (reattach)
   ```

---

## Checklist szybkiego startu

- [ ] Wymagania spełnione (g++, opcjonalnie OpenSSL)
- [ ] Źródła pobrane i wypakowane
- [ ] `./configure` wykonane
- [ ] `make` zakończone sukcesem
- [ ] `make install` wykonane
- [ ] Konfiguracja utworzona (`./psotnic -n`)
- [ ] Bot uruchomiony (`./psotnic bot.cfg`)
- [ ] Bot połączony z IRC
- [ ] Bot na kanale
- [ ] Połączenie z partyline działa
- [ ] Podstawowe komendy przetestowane

**Gratulacje! Masz działającego bota Psotnic!** 🎉

---

## Przydatne linki

- **Dokumentacja główna**: DOKUMENTACJA_PL.md
- **Architektura techniczna**: ARCHITEKTURA_TECHNICZNA_PL.md
- **Oficjalna strona**: http://www.psotnic.com
- **Wiki**: docs/wiki/

## Wsparcie

Jeśli napotkasz problemy:

1. Sprawdź sekcję "Rozwiązywanie problemów" w pełnej dokumentacji
2. Włącz tryb debug: `./psotnic -d bot.cfg`
3. Sprawdź logi
4. Przeczytaj CHANGELOG dla informacji o zmianach

---

**Wersja**: 1.0  
**Data**: 2025  
**Licencja**: GPL-2.0

*Koniec przewodnika szybkiego startu*
