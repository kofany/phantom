# Dokumentacja Psotnic - Bot IRC

## Spis treści

1. [Wprowadzenie](#wprowadzenie)
2. [Architektura systemu](#architektura-systemu)
3. [Wymagania i instalacja](#wymagania-i-instalacja)
4. [Konfiguracja](#konfiguracja)
5. [Struktura projektu](#struktura-projektu)
6. [Moduły](#moduły)
7. [API i hooki dla programistów](#api-i-hooki-dla-programistów)
8. [Bezpieczeństwo](#bezpieczeństwo)
9. [Rozwiązywanie problemów](#rozwiązywanie-problemów)

---

## Wprowadzenie

**Psotnic** to zaawansowany bot IRC (Internet Relay Chat) napisany w C++, zaprojektowany do zarządzania siecią botów w architekturze hub-slave-leaf. System umożliwia automatyczne zarządzanie kanałami IRC, kontrolę użytkowników, ochronę przed spamem oraz wiele innych funkcji moderacyjnych.

### Główne cechy

- **Architektura rozproszona**: Hub/Slave/Leaf dla skalowalnego zarządzania botnetu
- **Szyfrowanie**: Wsparcie dla Blowfish i MD5 do zabezpieczenia konfiguracji
- **Modułowość**: System rozszerzalnych modułów
- **Bezpieczeństwo**: Obsługa SSL/TLS, kontrola dostępu, szyfrowane połączenia
- **Automatyzacja**: Automatyczne zarządzanie kanałami, użytkownikami i trybami
- **Wsparcie IPv4/IPv6**: Pełna obsługa obu protokołów
- **Partyline**: Zintegrowany system kontroli przez IRC

### Licencja

Projekt jest rozpowszechniany na licencji GNU General Public License v2 (GPL-2.0).

---

## Architektura systemu

### Typy botów

Psotnic wykorzystuje hierarchiczną strukturę botów:

#### 1. MAIN (Hub)
**Rola**: Główny kontroler botnetu
- Zarządza wszystkimi botami podłączonymi do sieci
- Przechowuje główną listę użytkowników (userlist)
- Dystrybuuje konfigurację do botów slave
- Zarządza uprawnieniami i kontrolą dostępu

#### 2. SLAVE
**Rola**: Bot pośredni
- Łączy się z botem MAIN/HUB
- Otrzymuje i przechowuje lokalną kopię userlist
- Może zarządzać własnymi kanałami
- Może hostować boty LEAF
- Synchronizuje zmiany z HUBem

#### 3. LEAF
**Rola**: Bot końcowy
- Najniższy poziom w hierarchii
- Łączy się ze SLAVE lub bezpośrednio z MAIN
- Nie hostuje innych botów
- Wykonuje polecenia od botów nadrzędnych

### Przepływ komunikacji

```
         [MAIN/HUB]
              |
    +---------+---------+
    |                   |
 [SLAVE]             [SLAVE]
    |                   |
 [LEAF]              [LEAF]
```

### Główne komponenty

#### 1. Rdzeń systemu (Core)
- **main.cpp**: Główna pętla zdarzeń (event loop)
- **class-inet.cpp**: Zarządzanie połączeniami sieciowymi
- **class-client.cpp**: Obsługa klienta IRC
- **signals.cpp**: Obsługa sygnałów systemowych

#### 2. System parsowania
- **parse-irc.cpp**: Parsowanie wiadomości IRC
- **parse-hub.cpp**: Parsowanie poleceń od HUBa
- **parse-bot.cpp**: Parsowanie komunikacji międzybotowej
- **parse-ctcp.cpp**: Obsługa CTCP (Client-To-Client Protocol)
- **parse-botnet.cpp**: Komunikacja w sieci botów

#### 3. Zarządzanie stanem
- **class-chan.cpp**: Zarządzanie kanałami
- **class-userlist.cpp**: Lista użytkowników i uprawnień
- **class-ent.cpp**: System encji (entities)
- **class-options.cpp**: System konfiguracji

#### 4. Bezpieczeństwo i szyfrowanie
- **class-blowfish.cpp**: Szyfrowanie Blowfish
- **md5.cpp**: Hashowanie MD5
- **config-load.cpp/config-create.cpp**: Zarządzanie zaszyfrowaną konfiguracją

#### 5. Networking
- **class-adns-*.cpp**: Asynchroniczne rozwiązywanie DNS (ADNS)
- **class-http.cpp**: Obsługa HTTP
- **class-server.cpp**: Zarządzanie serwerami IRC

---

## Wymagania i instalacja

### Wymagania systemowe

#### Wymagane:
- **System operacyjny**: Linux/Unix (testowane na Ubuntu, Debian, CentOS)
- **Kompilator**: g++ z obsługą C++98 lub nowszego
- **Biblioteki**:
  - POSIX (pthread)
  - Standard C/C++ libraries

#### Opcjonalne:
- **OpenSSL**: Dla obsługi SSL/TLS
- **ADNS (pthread lub firedns)**: Dla asynchronicznego DNS
- **dlfcn**: Dla dynamicznych modułów

### Kompilacja

#### Krok 1: Pobranie i wypakowanie

```bash
tar xvzf psotnic-X.X.X.tar.gz
cd psotnic-X.X.X
```

#### Krok 2: Konfiguracja

```bash
./configure
```

**Opcje konfiguracji**:
- `--prefix=/ścieżka/instalacji` - Określa katalog instalacji (domyślnie: $HOME/psotnic)
- `--disable-modules` - Kompilacja bez obsługi modułów
- `--enable-debug` - Włączenie trybu debugowania

Przykład:
```bash
./configure --prefix=$HOME/moj-bot
```

#### Krok 3: Kompilacja

```bash
make
```

Kompilacja modułów (opcjonalnie):
```bash
make modules
```

#### Krok 4: Instalacja

```bash
make install
```

### Konfiguracja SSL (opcjonalnie)

Jeśli chcesz używać szyfrowanych połączeń SSL:

```bash
cd easy-rsa
. ./vars
./clean-all
./build-ca
./build-key-server server
```

**Ważne**: 
- Nie wklejaj wszystkich poleceń jednocześnie do terminala
- Przy pytaniu o "challenge password" wciśnij Enter (puste hasło)
- Przy pytaniu o podpisanie certyfikatu odpowiedz "yes"
- Przy pytaniu o zatwierdzenie (commit) odpowiedz "yes"

Skopiuj wygenerowane certyfikaty:
```bash
cp server.key server.crt $HOME/psotnic/
```

---

## Konfiguracja

### Tworzenie konfiguracji

#### Tryb standardowy

```bash
cd $HOME/psotnic
./psotnic -n
```

Bot przeprowadzi Cię przez interaktywny kreator konfiguracji.

#### Tryb ekspercki

```bash
./psotnic -ne
```

Tryb ekspercki daje więcej opcji konfiguracyjnych.

### Struktura pliku konfiguracyjnego

Plik konfiguracyjny jest **zaszyfrowany** przy użyciu algorytmu Blowfish. Oto główne zmienne konfiguracyjne:

#### Podstawowe ustawienia bota

```
nick <nick>                    - Nick bota na IRC
altnick <nick>                 - Alternatywny nick
ident <ident>                  - Ident bota
realname <realname>            - Realname bota
handle <handle>                - Unikatowy identyfikator bota (handle)
```

#### Typ bota

```
bottype <MAIN|SLAVE|LEAF>      - Typ bota w hierarchii
```

#### Połączenie z IRC

```
server <host> <port> [hasło]   - Dodaj serwer IRC
listen <ip> <port> <typ>       - Port nasłuchiwania (all/users/bots)
```

Przykłady:
```
server irc.example.com 6667
server ssl:irc.secure.com 6697 password123
listen 0.0.0.0 9000 all
listen ssl:0.0.0.0 9001 users
```

#### Połączenie z HUBem (dla SLAVE/LEAF)

```
hub <host> <port> <hasło> <handle_huba>
```

Przykład:
```
hub 192.168.1.10 9000 tajnehaslo MainBot
```

#### Kanały

```
channel <nazwa>                - Dodaj kanał do autojoin
```

#### Hasła

```
ownerpass <hasło>              - Hasło właściciela (owner)
```

#### IPv6

```
myipv6 <adres>                 - Adres IPv6 bota
```

### Uruchamianie bota

```bash
./psotnic nazwa_pliku_konfiguracji
```

Przykład:
```bash
./psotnic bot.cfg
```

Bot automatycznie przejdzie w tryb daemon (tło) jeśli nie jest w trybie debug.

---

## Struktura projektu

### Organizacja katalogów

```
psotnic/
├── bin/                    # Skompilowane binaria
├── cfg-examples/           # Przykłady konfiguracji
├── docs/                   # Dokumentacja
│   ├── wiki/              # Wiki projektu
│   └── *.dox              # Pliki Doxygen
├── easy-rsa/              # Narzędzia do generowania certyfikatów SSL
├── modules/               # Kod źródłowy modułów
│   ├── plog/             # Moduł logowania
│   ├── vctrl.cpp         # Voice Control
│   ├── spam.cpp          # Anty-spam
│   ├── repeat.cpp        # Anty-repeat
│   └── ...
├── tests/                 # Testy
├── main.cpp               # Główny plik programu
├── classes.h              # Definicje klas
├── prots.h                # Prototypy funkcji i include'y
├── defines.h              # Definicje stałych
├── Makefile              # Makefile
└── configure             # Skrypt konfiguracji
```

### Główne pliki źródłowe

#### Rdzeń aplikacji

- **main.cpp**: Główna pętla programu, inicjalizacja, obsługa select()
- **classes.h**: Deklaracje wszystkich głównych klas
- **prots.h**: Prototypy funkcji, include systemowe i projektowe
- **defines.h**: Makra i stałe
- **structs.h**: Struktury danych
- **global-var.h**: Zmienne globalne

#### Zarządzanie konfiguracją

- **config-create.cpp**: Interaktywny kreator konfiguracji
- **config-load.cpp**: Wczytywanie zaszyfrowanej konfiguracji
- **class-options.cpp**: System opcji i ustawień

#### Networking

- **class-inet.cpp**: Główna klasa zarządzania siecią
- **class-client.cpp**: Obsługa klienta IRC
- **class-server.cpp**: Zarządzanie serwerami IRC
- **class-adns-pthread.cpp**: DNS resolver (wersja pthread)
- **class-adns-firedns.cpp**: DNS resolver (wersja firedns)

#### IRC

- **parse-irc.cpp**: Parsowanie protokołu IRC
- **parse-ctcp.cpp**: Obsługa CTCP
- **botcmd.cpp**: Komendy bota na IRC
- **ctcp.h**: Definicje CTCP
- **numeric_def.h**: Numeryczne kody odpowiedzi IRC

#### Botnet

- **parse-hub.cpp**: Komunikacja z HUBem
- **parse-bot.cpp**: Komunikacja międzybotowa
- **parse-botnet.cpp**: Protokół botnetu

#### Kanały i użytkownicy

- **class-chan.cpp**: Obsługa kanałów IRC
- **class-chan-actions.cpp**: Akcje na kanałach
- **class-chan-gotmode.cpp**: Obsługa trybów kanałów
- **class-userlist.cpp**: Lista użytkowników i flagów
- **class-ent.cpp**: System encji (entities)
- **class-shitlist.cpp**: Lista banów

#### Bezpieczeństwo

- **class-blowfish.cpp**: Szyfrowanie Blowfish
- **md5.cpp**: Hashowanie MD5
- **scram.cpp**: Zaciemnianie kodu
- **random.cpp**: Generator liczb losowych (Isaac)

#### Partyline

- **partyline.cpp**: System kontroli przez partyline
- **class-listcmd.cpp**: Komendy listowe

#### Utility

- **functions.cpp**: Funkcje pomocnicze
- **match.cpp**: Dopasowywanie masek IRC
- **signals.cpp**: Obsługa sygnałów
- **class-fifo.cpp**: Kolejka FIFO
- **class-modeq.cpp**: Kolejka trybów
- **class-penal.cpp**: System kar (penalties)

---

## Moduły

Psotnic posiada rozszerzalny system modułów. Moduły są kompilowane jako biblioteki dynamiczne (.so) i mogą być ładowane w czasie działania bota.

### Dostępne moduły

#### 1. **vctrl** (Voice Control)
**Opis**: Zaawansowana kontrola głosu (voice) na kanale z granularnym systemem uprawnień.

**Funkcje**:
- Komendy dla użytkowników z voice: !kick, !ban, !topic, !voice, !devoice
- Dwupoziomowy system dostępu:
  - Użytkownicy dodani (z flagami w userlist): pełny dostęp
  - Użytkownicy z voice bez flag: tylko !topic
- Tryb cichy dla nieuprawnionej interakcji (bezpieczeństwo)
- Konfigurowalny format banów
- Ochrona użytkowników z voice przed kickiem

**Konfiguracja partyline**:
```
.bc <bot> vset [klucz] [wartość]
.bc <bot> vchanset <kanał> [klucz] [wartość]
```

**Ważne ustawienia**:
- `voicecontrol` - Włącz/wyłącz kontrolę voice
- `max-delay` - Losowe opóźnienie (0-60s)
- `ban-type` - Format banu (*!%i@%h)
- `dont-kick-voiced-users` - Ochrona użytkowników z voice

**Komendy IRC**:
- `!kick <nick> [powód]`
- `!ban <nick> [powód]`
- `!banmask <maska>`
- `!unban <maska>`
- `!topic <tekst>`
- `!voice <nick>`
- `!devoice <nick>`

#### 2. **spam**
**Opis**: Ochrona przed spamem na kanale.

**Funkcje**:
- Detekcja powtarzających się wiadomości
- Detekcja flood'u (zbyt wiele wiadomości w krótkim czasie)
- Automatyczne kary (ban/kick)
- Konfigurowalny próg detekcji

#### 3. **repeat**
**Opis**: Ochrona przed powtarzaniem tych samych wiadomości.

**Funkcje**:
- Wykrywanie identycznych lub podobnych wiadomości
- Konfigurowalna tolerancja podobieństwa
- Automatyczne działania (ostrzeżenie/kick/ban)

#### 4. **topic**
**Opis**: Zarządzanie tematem kanału.

**Funkcje**:
- Automatyczne przywracanie tematu
- Zapamiętywanie tematu kanału
- Ochrona przed nieautoryzowaną zmianą

#### 5. **peak / peak2**
**Opis**: Statystyki kanału - maksymalna liczba użytkowników.

**Funkcje**:
- Śledzenie rekordowej liczby użytkowników
- Zapisywanie daty i czasu rekordu
- Wyświetlanie statystyk

#### 6. **uptime**
**Opis**: Informacje o czasie działania bota.

**Funkcje**:
- Czas od uruchomienia bota
- Czas połączenia z IRC
- Statystyki działania

#### 7. **words**
**Opis**: Filtrowanie słów/fraz na kanale.

**Funkcje**:
- Lista zabronionych słów
- Automatyczne kary za użycie
- Import/export listy słów

#### 8. **ads**
**Opis**: Ochrona przed reklamami i spamem zaproszeń.

**Funkcje**:
- Wykrywanie linków do innych kanałów
- Wykrywanie adresów URL
- Automatyczne działania

#### 9. **nogarbage**
**Opis**: Filtrowanie "śmieci" - losowych znaków, nadmiernych kolorów itp.

**Funkcje**:
- Detekcja losowych ciągów znaków
- Detekcja nadużycia kolorów IRC
- Detekcja nadużycia pogrubienia/podkreślenia

#### 10. **badrealname**
**Opis**: Filtrowanie użytkowników według realname.

**Funkcje**:
- Sprawdzanie realname przy wejściu na kanał
- Lista zabronionych wzorców
- Automatyczny ban/kick

#### 11. **op**
**Opis**: Proste auto-op dla użytkowników.

**Funkcje**:
- Automatyczne nadawanie OP użytkownikom z odpowiednimi flagami

#### 12. **oidentd**
**Opis**: Integracja z oidentd (ident spoofing).

**Funkcje**:
- Zmiana ident przed połączeniem z IRC
- Automatyczna konfiguracja oidentd

#### 13. **control**
**Opis**: Dodatkowe komendy kontrolne.

**Funkcje**:
- Rozszerzone polecenia partyline
- Dodatkowe funkcje zarządzania

#### 14. **plog**
**Opis**: Rozbudowany system logowania.

**Funkcje**:
- Logowanie wiadomości z kanałów
- Logowanie zdarzeń botnet
- Rotacja logów
- Konfigurowalny format

#### 15. **noautorejoin**
**Opis**: Blokowanie automatycznego rejoin po kick.

**Funkcje**:
- Wykrywanie i karanie za szybki rejoin
- Konfigurowalne opóźnienia

#### 16. **date**
**Opis**: Wyświetlanie daty i czasu.

**Funkcje**:
- Komenda !date na kanale
- Różne formaty daty

#### 17. **dccchat**
**Opis**: Obsługa DCC CHAT.

**Funkcje**:
- Połączenia DCC CHAT z użytkownikami
- Partyline przez DCC

#### 18. **mdev**
**Opis**: Developer tools - narzędzia deweloperskie.

**Funkcje**:
- Testowanie i debugowanie modułów
- Dodatkowe funkcje diagnostyczne

### Kompilacja modułów

```bash
cd modules
make
```

Moduły zostaną skompilowane jako pliki .so w katalogu modules/.

### Ładowanie modułów

Moduły można ładować na różne sposoby:

#### 1. W pliku konfiguracyjnym

```
loadmodule /ścieżka/do/modułu.so
```

#### 2. Z partyline

```
.bc <bot> loadmod /ścieżka/do/modułu.so
```

### Tworzenie własnego modułu

Podstawowa struktura modułu:

```cpp
#include <prots.h>
#include <global-var.h>

// Informacje o module
extern "C" {
    module *init()
    {
        module *m = new module("NazwaModułu", "autor@example.com", "1.0");
        
        // Rejestracja hooków
        m->hook_privmsg = hook_privmsg;
        m->hook_join = hook_join;
        // ... inne hooki
        
        return m;
    }
}

// Implementacja hooków
int hook_privmsg(inetconn *c, char *mask, char *to, char *msg)
{
    // Obsługa wiadomości prywatnej
    return 0;
}

int hook_join(inetconn *c, char *mask, char *channel)
{
    // Obsługa wejścia na kanał
    return 0;
}
```

---

## API i hooki dla programistów

### System hooków

Psotnic udostępnia system hooków (haczyków), które pozwalają modułom przechwytywać i reagować na różne zdarzenia.

#### Dostępne hooki

##### 1. IRC Events

**hook_privmsg**
```cpp
int hook_privmsg(inetconn *c, char *mask, char *to, char *msg)
```
- Wywoływany przy otrzymaniu wiadomości PRIVMSG
- `mask`: Maska użytkownika (nick!ident@host)
- `to`: Odbiorca (kanał lub nick)
- `msg`: Treść wiadomości
- Return: 0 (kontynuuj), 1 (zatrzymaj dalsze przetwarzanie)

**hook_notice**
```cpp
int hook_notice(inetconn *c, char *mask, char *to, char *msg)
```
- Wywoływany przy otrzymaniu NOTICE
- Parametry identyczne jak hook_privmsg

**hook_join**
```cpp
int hook_join(inetconn *c, char *mask, char *channel)
```
- Wywoływany gdy użytkownik wchodzi na kanał
- `mask`: Maska użytkownika
- `channel`: Nazwa kanału

**hook_part**
```cpp
int hook_part(inetconn *c, char *mask, char *channel, char *msg)
```
- Wywoływany gdy użytkownik opuszcza kanał
- `msg`: Wiadomość part (może być NULL)

**hook_quit**
```cpp
int hook_quit(inetconn *c, char *mask, char *reason)
```
- Wywoływany gdy użytkownik rozłącza się
- `reason`: Powód quit

**hook_kick**
```cpp
int hook_kick(inetconn *c, char *mask, char *channel, char *kicked, char *reason)
```
- Wywoływany gdy ktoś jest kickowany
- `kicked`: Nick kickowanego użytkownika
- `reason`: Powód kick

**hook_mode**
```cpp
int hook_mode(inetconn *c, char *mask, char *channel, char *mode, char *target)
```
- Wywoływany przy zmianie trybu kanału
- `mode`: Zmiana trybu (np. "+o")
- `target`: Cel zmiany (użytkownik lub NULL)

**hook_nick**
```cpp
int hook_nick(inetconn *c, char *mask, char *newnick)
```
- Wywoływany przy zmianie nicka
- `newnick`: Nowy nick

**hook_topic**
```cpp
int hook_topic(inetconn *c, char *mask, char *channel, char *topic)
```
- Wywoływany przy zmianie tematu

**hook_invite**
```cpp
int hook_invite(inetconn *c, char *mask, char *channel)
```
- Wywoływany przy zaproszeniu na kanał

##### 2. Bot Events

**hook_ctcp**
```cpp
int hook_ctcp(inetconn *c, char *mask, char *to, char *msg)
```
- Wywoływany przy CTCP
- `msg`: Komenda CTCP (np. "VERSION")

**hook_timer**
```cpp
int hook_timer()
```
- Wywoływany co sekundę
- Przydatny do okresowych zadań

**hook_userlistLoaded**
```cpp
int hook_userlistLoaded()
```
- Wywoływany po załadowaniu userlist

**hook_connected_to_irc**
```cpp
int hook_connected_to_irc()
```
- Wywoływany po nawiązaniu połączenia z IRC

**hook_disconnected_from_irc**
```cpp
int hook_disconnected_from_irc()
```
- Wywoływany po rozłączeniu z IRC

**hook_registered_on_irc**
```cpp
int hook_registered_on_irc()
```
- Wywoływany po zarejestrowaniu na serwerze IRC

##### 3. Botnet Events

**hook_botnet_command**
```cpp
int hook_botnet_command(inetconn *c, char *cmd, char *args)
```
- Wywoływany przy komendzie botnet
- `c`: Połączenie botnet
- `cmd`: Komenda
- `args`: Argumenty

##### 4. Raw IRC

**hook_rawirc**
```cpp
int hook_rawirc(char *data)
```
- Wywoływany przy każdej linii otrzymanej z IRC
- `data`: Surowa linia IRC
- Wywoływany PRZED standardowym parsowaniem

### Klasy i struktury

#### Klasa: chan (Kanał)

```cpp
class chan
{
public:
    char *name;                      // Nazwa kanału
    ptrlist<chanuser> users;         // Lista użytkowników
    char *topic;                     // Temat kanału
    char *key;                       // Klucz kanału (hasło)
    int limit;                       // Limit użytkowników
    
    // Metody
    chanuser *getUser(const char *nick);
    void send(const char *format, ...);
    void sendNotice(const char *format, ...);
    // ... więcej metod
};
```

#### Klasa: chanuser (Użytkownik na kanale)

```cpp
class chanuser
{
public:
    char *nick;                      // Nick
    char *ident;                     // Ident
    char *host;                      // Host
    char *ip;                        // Adres IP
    int flags;                       // Flagi (OP, VOICE, etc.)
    
    // Metody
    bool hasFlag(int flag);
    HANDLE *handle();                // Odniesienie do userlist
    // ... więcej metod
};
```

#### Klasa: HANDLE (Wpis w userlist)

```cpp
struct HANDLE
{
    char *name;                      // Handle użytkownika
    int flags[MAX_CHANNELS+1];       // Flagi dla każdego kanału + globalne
    ptrlist<HOSTLIST> *hosts;        // Lista hostmask'ów
    
    // Sprawdzanie flag
    bool isMain();                   // Ma flagę H
    bool hasFlag(int flag);
};
```

#### Globalne obiekty

```cpp
extern client ME;                    // Bot (my)
extern ul userlist;                  // Lista użytkowników
extern inet net;                     // Zarządzanie siecią
extern CONFIG config;                // Konfiguracja
extern settings set;                 // Ustawienia
```

### Funkcje pomocnicze

#### Wysyłanie wiadomości

```cpp
// Wysłanie na kanał
ME.sendPrivmsg(const char *to, const char *format, ...);

// Wysłanie notice
ME.sendNotice(const char *to, const char *format, ...);

// Surowa komenda IRC
net.irc.send(const char *format, ...);
```

#### Dopasowywanie masek

```cpp
// Dopasowanie nick!ident@host do maski
int match(const char *mask, const char *string);

// Dopasowanie banu do użytkownika
int matchBan(const char *ban, chanuser *user);
```

#### Timery

```cpp
// Aktualny czas (aktualizowany co sekundę)
extern time_t NOW;

// Zaplanuj akcję
// (w hook_timer sprawdzaj NOW >= planned_time)
```

### Przykład: Prosty moduł statystyk

```cpp
#include <prots.h>
#include <global-var.h>

// Statystyki
static int msg_count = 0;
static int join_count = 0;

extern "C" {
    module *init()
    {
        module *m = new module("Stats", "user@example.com", "1.0");
        
        m->hook_privmsg = hook_privmsg;
        m->hook_join = hook_join;
        m->hook_timer = hook_timer;
        
        return m;
    }
}

int hook_privmsg(inetconn *c, char *mask, char *to, char *msg)
{
    msg_count++;
    
    // Komenda !stats
    if(!strcmp(msg, "!stats"))
    {
        ME.sendPrivmsg(to, "[Stats] Wiadomości: %d, Wejścia: %d", 
                       msg_count, join_count);
    }
    
    return 0;
}

int hook_join(inetconn *c, char *mask, char *channel)
{
    join_count++;
    return 0;
}

int hook_timer()
{
    // Co godzinę wyświetl statystyki
    static time_t next_display = 0;
    
    if(NOW >= next_display)
    {
        printf("[Stats] Msg: %d, Join: %d\n", msg_count, join_count);
        next_display = NOW + 3600;
    }
    
    return 0;
}
```

---

## Bezpieczeństwo

### Szyfrowanie konfiguracji

Psotnic używa algorytmu **Blowfish** do szyfrowania pliku konfiguracyjnego. Zapewnia to:
- Ochronę haseł i danych wrażliwych
- Niemożność odczytu konfiguracji bez klucza
- Bezpieczne przechowywanie userlist

### SSL/TLS

Wsparcie dla bezpiecznych połączeń:

**Połączenie z IRC przez SSL**:
```
server ssl:irc.example.com 6697
```

**Nasłuchiwanie SSL dla botów/użytkowników**:
```
listen ssl:0.0.0.0 9001 all
```

### Kontrola dostępu

#### System flag

Psotnic używa flag do określania uprawnień:

**Globalne flagi**:
- `+H` - Hub (właściciel botnetu)
- `+P` - Party (dostęp do partyline)
- `+n` - Admin (administracja)
- `+m` - Master (zarządzanie)
- `+a` - Auto-op
- `+d` - Dyskwalifikowany (deny)

**Flagi kanałowe**:
- `+o` - Op
- `+v` - Voice
- `+f` - Friend
- `+l` - Lamer (kickowany)

#### Dodawanie użytkowników

```
.+user <handle> <hostmask>
.chattr <handle> <flagi>
```

Przykład:
```
.+user JanKowalski jan!*@*.example.com
.chattr JanKowalski +no #channel
```

### Ochrona przed DDoS

- **Rate limiting**: Ograniczenie częstotliwości połączeń
- **Flood protection**: Ochrona przed flood'em
- **Blacklist**: Lista zablokowanych hostów

### Ochrona partyline

- **Wymagane hasło**: ownerpass
- **Ograniczenie IP**: `.+/-addr` - ograniczenie dostępu według IP
- **Szyfrowane połączenia**: SSL dla partyline
- **Timeout**: Automatyczne rozłączanie nieaktywnych sesji

### Najlepsze praktyki

1. **Używaj silnych haseł**
   - Minimum 12 znaków
   - Kombinacja liter, cyfr i znaków specjalnych

2. **Włącz SSL**
   - Dla połączeń IRC
   - Dla połączeń botnet
   - Dla partyline

3. **Ogranicz dostęp**
   - Używaj `.+addr` do ograniczenia IP
   - Minimalizuj liczbę użytkowników z +H/+n

4. **Regularnie aktualizuj**
   - Używaj `.bc <bot> update` do aktualizacji
   - Śledź zmiany w CHANGELOG

5. **Monitoruj logi**
   - Używaj modułu `plog`
   - Regularnie przeglądaj logi pod kątem podejrzanej aktywności

6. **Ochrona serwera**
   - Uruchamiaj bota na dedykowanym koncie
   - Używaj firewall'a do ograniczenia dostępu
   - Regularnie aktualizuj system operacyjny

### Moduł vctrl - Udoskonalenia bezpieczeństwa

Moduł **vctrl** otrzymał znaczące usprawnienia bezpieczeństwa (Phantom contributors):

#### Silent Mode
- Użytkownicy nieautoryzowani (bez flag w userlist) nie otrzymują ŻADNEJ odpowiedzi na restrykcyjne komendy
- Eliminacja wycieków informacji o mechanizmach kontroli dostępu
- Ochrona przed rekonsensansem (reconnaissance)

#### Dwupoziomowy dostęp
- **Użytkownicy dodani** (z flagami): Pełen dostęp do wszystkich komend
- **Użytkownicy tylko z +v**: Dostęp tylko do `!topic`
- Automatyczna detekcja statusu użytkownika

#### Brak informacji o błędach
- Komunikaty o błędach składni tylko dla autoryzowanych użytkowników
- Brak komunikatów powitalnych dla nieautoryzowanych
- Ciche ignorowanie prób nieautoryzowanego dostępu

---

## Rozwiązywanie problemów

### Problemy z kompilacją

#### Błąd: "Cannot find -lssl"

**Rozwiązanie**: Zainstaluj bibliotekę OpenSSL:
```bash
# Debian/Ubuntu
sudo apt-get install libssl-dev

# CentOS/RHEL
sudo yum install openssl-devel
```

#### Błąd: "Cannot find -lpthread"

**Rozwiązanie**: Upewnij się, że masz zainstalowane pthread:
```bash
sudo apt-get install libc6-dev
```

#### Błąd przy kompilacji modułów

**Rozwiązanie**: Upewnij się, że main bot został poprawnie skompilowany:
```bash
make clean
make
make modules
```

### Problemy z konfiguracją

#### Bot nie łączy się z IRC

**Przyczyny i rozwiązania**:

1. **Zły serwer/port**:
   - Sprawdź poprawność adresu serwera
   - Sprawdź czy port jest otwarty: `telnet irc.server.com 6667`

2. **Firewall**:
   - Sprawdź czy firewall blokuje wychodzące połączenia
   - Otwórz port wychodzący

3. **Banned hostname**:
   - Niektóre serwery banują VPS/cloud providers
   - Spróbuj innego serwera

4. **Niewłaściwe rozwiązywanie DNS**:
   - Włącz debug: `./psotnic -d config`
   - Sprawdź logi DNS

#### Bot nie łączy się z HUBem

**Przyczyny i rozwiązania**:

1. **Niewłaściwe hasło**:
   - Sprawdź czy hasło w slave odpowiada hasłu w hub
   - Hasła są case-sensitive

2. **Bot nie dodany na HUBie**:
   ```
   .+user <handle_slave> <ip_slave>
   .chattr <handle_slave> +PSb
   ```

3. **Firewall/NAT**:
   - Upewnij się że HUB nasłuchuje na właściwym porcie
   - Sprawdź forwarding portów

4. **Niewłaściwy listen**:
   - HUB musi mieć: `listen <ip> <port> bots`

#### Userlist nie synchronizuje się

**Rozwiązania**:

1. **Sprawdź połączenie botnet**:
   ```
   .bots           # Lista połączonych botów
   .bottree        # Drzewo botnet
   ```

2. **Wymuś synchronizację**:
   ```
   .bc <slave> resync
   ```

3. **Sprawdź uprawnienia bota**:
   - Slave musi mieć flagę +P

### Problemy z modułami

#### Moduł nie ładuje się

**Rozwiązania**:

1. **Sprawdź ścieżkę**:
   - Używaj pełnej ścieżki: `/home/user/psotnic/modules/vctrl.so`

2. **Sprawdź uprawnienia**:
   ```bash
   chmod 755 modul.so
   ```

3. **Sprawdź czy moduł jest skompilowany**:
   ```bash
   file modul.so    # Powinno pokazać "ELF shared object"
   ```

4. **Sprawdź zależności**:
   ```bash
   ldd modul.so     # Sprawdź czy wszystkie biblioteki są dostępne
   ```

#### Moduł crashuje bota

**Rozwiązania**:

1. **Włącz debug**:
   ```bash
   make clean
   ./configure --enable-debug
   make
   ```

2. **Sprawdź core dump**:
   ```bash
   gdb ./psotnic core
   bt    # Backtrace
   ```

3. **Wyłącz moduł**:
   - Usuń `loadmodule` z konfiguracji
   - Lub: `.bc <bot> unloadmod <moduł>`

### Problemy wydajnościowe

#### Bot zużywa dużo CPU

**Przyczyny i rozwiązania**:

1. **Zbyt wiele połączeń SSL**:
   - Ogranicz liczbę połączeń SSL
   - Zwiększ opóźnienia w module vctrl

2. **Flood na kanale**:
   - Włącz moduły spam/repeat
   - Zwiększ penalty

3. **Zbyt częste DNS queries**:
   - Zwiększ `domain-ttl`
   - Zmniejsz `resolve-threads`

#### Bot laguje

**Rozwiązania**:

1. **Sprawdź lag**:
   ```
   .bc <bot> status    # Sprawdź current lag
   ```

2. **Zwiększ conn-timeout**:
   ```
   .set conn-timeout 600
   ```

3. **Zmień serwer IRC**:
   ```
   .bc <bot> jump <numer>
   ```

### Problemy z SSL

#### "SSL handshake failed"

**Rozwiązania**:

1. **Regeneruj certyfikaty**:
   ```bash
   cd easy-rsa
   ./clean-all
   ./build-ca
   ./build-key-server server
   ```

2. **Sprawdź certyfikaty**:
   ```bash
   openssl verify server.crt
   ```

3. **Sprawdź uprawnienia**:
   ```bash
   chmod 600 server.key
   chmod 644 server.crt
   ```

### Debugging

#### Włączenie trybu debug

```bash
# Kompilacja z debug
./configure --enable-debug
make clean
make

# Uruchomienie w trybie debug
./psotnic -d config
```

#### Przydatne komendy debug

```
.bc <bot> status        # Status bota
.bc <bot> cfg           # Wyświetl konfigurację
.bottree                # Drzewo botnet
.bots                   # Lista botów
.match <mask>           # Sprawdź maskę
.bc <bot> names #chan   # Lista użytkowników kanału
.bc <bot> cwho #chan    # Szczegóły użytkowników
```

#### Logi

Psotnic loguje do stdout (lub pliku jeśli przekierowane):

```bash
# Uruchomienie z logowaniem
./psotnic config > bot.log 2>&1 &

# Podgląd logów na żywo
tail -f bot.log
```

### Pomoc i wsparcie

#### Dokumentacja

- Oficjalna strona: http://www.psotnic.com (może być nieaktywna)
- Wiki: docs/wiki/
- Doxygen: Wygeneruj przez: `doxygen Doxyfile`

#### Community

- Kanał IRC: #psotnic @ IRCnet (historyczny, może być nieaktywny)
- GitHub: Sprawdź czy istnieje aktywny fork

#### Zgłaszanie błędów

Przy zgłaszaniu błędów załącz:
1. Wersję Psotnic (`./psotnic -v`)
2. System operacyjny i wersję
3. Pełny error message
4. Kroki do reprodukcji
5. Backtrace (jeśli crash)

---

## Podsumowanie

Psotnic to potężne narzędzie do zarządzania botnetu IRC. Kluczowe punkty:

✅ **Architektura**: Hub/Slave/Leaf dla skalowalności
✅ **Bezpieczeństwo**: Szyfrowanie, SSL, kontrola dostępu
✅ **Modułowość**: Rozszerzalny system modułów
✅ **Automatyzacja**: Zarządzanie kanałami, użytkownikami, ochrona
✅ **Partyline**: Pełna kontrola przez IRC

### Następne kroki

1. **Instalacja**: Przejdź przez sekcję [Instalacja](#wymagania-i-instalacja)
2. **Konfiguracja**: Stwórz konfigurację używając `./psotnic -n`
3. **Uruchomienie**: Uruchom bota i połącz się z IRC
4. **Moduły**: Załaduj potrzebne moduły
5. **Dostosowanie**: Konfiguruj ustawienia przez partyline

### Dobre praktyki

- 🔒 **Zawsze używaj SSL** dla krytycznych połączeń
- 🔑 **Silne hasła** (12+ znaków)
- 📝 **Regularnie twórz backup** userlist
- 🔄 **Aktualizuj** do najnowszej wersji
- 📊 **Monitoruj** działanie bota
- 🛡️ **Ogranicz dostęp** do minimum

---

**Wersja dokumentacji**: 1.0  
**Data ostatniej aktualizacji**: 2025  
**Autorzy**: Bazując na oficjalnej dokumentacji projektu Psotnic oraz analizie kodu źródłowego  
**Licencja dokumentacji**: Zgodna z licencją projektu (GPL-2.0)

---

## Dodatek: Szybki przewodnik komend partyline

### Zarządzanie botami

```
.bots                          # Lista połączonych botów
.bottree                       # Drzewo hierarchii botnet
.bc <bot> <komenda>           # Wykonaj komendę na bocie
.bc <bot> die                 # Zamknij bota
.bc <bot> restart             # Zrestartuj bota
.bc <bot> status              # Status bota
.bc <bot> update [id:pw]      # Aktualizuj bota
.bc <bot> stopupdate          # Zatrzymaj aktualizację
```

### Zarządzanie użytkownikami

```
.+user <handle> <mask>        # Dodaj użytkownika
.-user <handle>               # Usuń użytkownika
.chattr <handle> <flagi>      # Zmień flagi
.+addr <handle> <ip>          # Dodaj dozwolony IP
.-addr <handle> <ip>          # Usuń dozwolony IP
.match <mask>                 # Sprawdź dopasowanie maski
.passwd <hasło>               # Zmień swoje hasło
.chpass <handle> <hasło>      # Zmień hasło użytkownika
```

### Zarządzanie kanałami

```
.+chan <#kanał>               # Dodaj kanał
.-chan <#kanał>               # Usuń kanał
.chanset <#kanał> <opcja>     # Ustaw opcję kanału
.cycle <#kanał>               # Opuść i wejdź na kanał
```

### Zarządzanie banami

```
.+ban <maska> <#kanał>        # Dodaj bana
.-ban <maska> <#kanał>        # Usuń bana
.+exempt <maska> <#kanał>     # Dodaj exempt (wyjątek od bana)
.-exempt <maska> <#kanał>     # Usuń exempt
```

### Konfiguracja

```
.set <opcja> [wartość]        # Ustaw opcję globalną
.bc <bot> cfg [opcja]         # Wyświetl/ustaw konfigurację
.bc <bot> save                # Zapisz konfigurację
```

### Moduły

```
.bc <bot> loadmod <plik>      # Załaduj moduł
.bc <bot> unloadmod <moduł>   # Wyładuj moduł
.bc <bot> listmod             # Lista załadowanych modułów
```

### IRC

```
.bc <bot> jump <nr>           # Przełącz serwer IRC
.bc <bot> raw <komenda>       # Wyślij surową komendę IRC
.bc <bot> names <#kanał>      # Lista nicków na kanale
.bc <bot> cwho <#kanał>       # Szczegółowa lista użytkowników
```

### Informacje

```
.help [komenda]               # Pomoc
.bc <bot> status              # Status bota
.bottree                      # Topologia botnet
.list [flagi]                 # Lista użytkowników
```

---

*Koniec dokumentacji*
