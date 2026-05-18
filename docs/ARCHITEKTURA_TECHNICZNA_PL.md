# Architektura techniczna Psotnic

## Spis treści

1. [Przegląd architektury](#przegląd-architektury)
2. [Główna pętla zdarzeń](#główna-pętla-zdarzeń)
3. [System klas](#system-klas)
4. [Protokoły komunikacji](#protokoły-komunikacji)
5. [Zarządzanie pamięcią](#zarządzanie-pamięcią)
6. [System modułów](#system-modułów)
7. [Bezpieczeństwo i kryptografia](#bezpieczeństwo-i-kryptografia)

---

## Przegląd architektury

### Model wielowątkowy vs jednowątkowy

Psotnic wykorzystuje **jednowątkowy model I/O** z multipleksowaniem przy użyciu `select()`:

```
┌─────────────────────────────────────┐
│         MAIN EVENT LOOP             │
│                                     │
│  while(!stopPsotnic) {             │
│    - select() na wszystkich fd      │
│    - obsługa timerów               │
│    - read/write na gotowych fd     │
│    - parsowanie danych             │
│    - wykonanie akcji               │
│  }                                  │
└─────────────────────────────────────┘
```

### Architektura warstw

```
┌───────────────────────────────────────────────────┐
│              WARSTWA MODUŁÓW                      │
│  (vctrl, spam, repeat, topic, etc.)              │
└───────────────────────────────────────────────────┘
                      ↕ (hooki)
┌───────────────────────────────────────────────────┐
│         WARSTWA LOGIKI APLIKACJI                  │
│  (zarządzanie kanałami, użytkownikami,           │
│   partyline, userlist, shitlist)                 │
└───────────────────────────────────────────────────┘
                      ↕
┌───────────────────────────────────────────────────┐
│           WARSTWA PROTOKOŁÓW                      │
│  (IRC, Botnet, CTCP)                             │
└───────────────────────────────────────────────────┘
                      ↕
┌───────────────────────────────────────────────────┐
│            WARSTWA SIECIOWA                       │
│  (inet, inetconn, adns, SSL)                     │
└───────────────────────────────────────────────────┘
                      ↕
┌───────────────────────────────────────────────────┐
│         WARSTWA SYSTEMU (sockets, OS)            │
└───────────────────────────────────────────────────┘
```

---

## Główna pętla zdarzeń

### Struktura main.cpp

```cpp
int main(int argc, char *argv[])
{
    // 1. INICJALIZACJA
    - parse_cmdline()          // Parsowanie argumentów
    - loadConfig()             // Wczytanie konfiguracji
    - userlist.load()          // Wczytanie userlist
    - resolver init            // Inicjalizacja DNS
    
    // 2. MAIN LOOP
    while(!stopPsotnic)
    {
        // 2.1. Aktualizacja stanu
        penalty.update();
        net.resize();
        
        // 2.2. Przygotowanie fd_set
        FD_ZERO(&rfd);
        FD_ZERO(&wfd);
        // Dodaj fd: irc, hub, listeners, boty
        
        // 2.3. SELECT (timeout: 1s)
        ret = select(net.maxFd+1, &rfd, &wfd, NULL, &tv);
        
        // 2.4. Obsługa timerów (co sekundę)
        if(diff > 0)
        {
            ME.checkQueue();
            userlist.autoSave();
            ignore.expire();
            HOOK(timer, timer());
            resolver->expire();
        }
        
        // 2.5. Połączenia (jeśli potrzeba)
        if(!net.hub.fd && config.bottype != BOT_MAIN)
            ME.connectToHUB();
        if(!net.irc.fd)
            ME.connectToIRC();
            
        // 2.6. Zapis buforów (write)
        for each connection:
            if FD_ISSET(fd, &wfd):
                writeBufferedData()
        
        // 2.7. Odczyt danych (read)
        if FD_ISSET(net.irc.fd, &rfd):
            n = readln(buf)
            HOOK(rawirc, rawirc(buf))
            parse_irc(buf)
            
        if FD_ISSET(net.hub.fd, &rfd):
            n = readln(buf)
            parse_hub(buf)
            
        for each bot connection:
            if FD_ISSET(fd, &rfd):
                n = readln(buf)
                parse_bot(c, buf)
                
        for each party connection:
            if FD_ISSET(fd, &rfd):
                n = readln(buf)
                parse_owner(c, buf)
    }
}
```

### Timing i Time Drift

Bot śledzi czas w zmiennej globalnej `NOW`:

```cpp
extern time_t NOW;  // Aktualizowany co select()

// Obsługa time drift
if(diff > 60 || diff < 0)
{
    // Kompensacja dla skoku czasu
    net.irc.killTime += diff;
    net.hub.killTime += diff;
    // ... etc
}
```

---

## System klas

### Główne klasy i ich odpowiedzialności

#### 1. class `client` (ME)

**Plik**: class-client.cpp  
**Odpowiedzialność**: Reprezentuje bota jako klienta IRC

```cpp
class client
{
public:
    char nick[MAX_LEN];           // Obecny nick
    char origNick[MAX_LEN];       // Oryginalny nick
    int status;                   // Status (połączony, zarejestrowany)
    
    // Połączenia
    time_t nextConnToIrc;
    time_t nextConnToHub;
    time_t nextReconnect;
    
    // Metody
    void connectToIRC();
    void connectToHUB();
    void sendPrivmsg(const char *to, const char *fmt, ...);
    void sendNotice(const char *to, const char *fmt, ...);
    void checkQueue();            // Sprawdź kolejkę wiadomości
    void newHostNotify();         // Powiadomienie o nowym hoście
};
```

**Użycie**:
```cpp
extern client ME;

ME.sendPrivmsg("#channel", "Hello world!");
ME.connectToIRC();
```

#### 2. class `inet`

**Plik**: class-inet.cpp  
**Odpowiedzialność**: Zarządzanie wszystkimi połączeniami sieciowymi

```cpp
class inet
{
public:
    inetconn irc;                 // Połączenie z IRC
    inetconn hub;                 // Połączenie z HUBem
    inetconn *conn;               // Array połączeń (boty, partyline)
    int max_conns;                // Maksymalna liczba połączeń
    
    ptrlist<listen_entry> listeners;  // Nasłuchujące sockety
    
    int maxFd;                    // Największy fd (dla select)
    
    // Metody
    void send(int flags, const char *fmt, ...);  // Broadcast do botów
    void resize();                                 // Zmiana rozmiaru conn[]
    inetconn* addConn(int fd);                    // Dodaj połączenie
};
```

#### 3. class `inetconn`

**Plik**: class-inet.cpp  
**Odpowiedzialność**: Pojedyncze połączenie sieciowe

```cpp
class inetconn
{
public:
    int fd;                       // File descriptor
    int status;                   // STATUS_CONNECTED, STATUS_REGISTERED, etc.
    char name[MAX_LEN];           // Nazwa (nick lub handle)
    char origin[MAX_LEN];         // IP:port
    
    // Bufory
    struct {
        char *buf;
        int len, pos;
    } read, write;
    
    #ifdef HAVE_SSL
    SSL *ssl;                     // SSL context
    #endif
    
    time_t killTime;              // Timeout
    time_t lastPing;              // Ostatni ping
    
    // Metody
    int send(const char *fmt, ...);
    int sendLine(const char *str);
    int readln(char *buf, int maxlen);
    void writeBufferedData();
    void close(const char *reason);
    bool isConnected();
    bool isRegBot();              // Czy to zarejestrowany bot
};
```

#### 4. class `chan`

**Plik**: class-chan.cpp  
**Odpowiedzialność**: Reprezentuje kanał IRC

```cpp
class chan
{
public:
    char *name;                   // Nazwa kanału
    char *topic;                  // Temat
    char *key;                    // Klucz (hasło)
    int limit;                    // Limit użytkowników
    char *mode;                   // Tryby kanału (+nt, etc.)
    
    ptrlist<chanuser> users;      // Lista użytkowników
    CHANLIST *chset;              // Ustawienia chanset
    
    modeQ queue;                  // Kolejka trybów (op, voice, ban)
    
    // Metody
    chanuser* getUser(const char *nick);
    void send(const char *fmt, ...);
    void sendNotice(const char *fmt, ...);
    void massKick(const char *reason, ...);
    void massOp();
    void massDeop();
};
```

#### 5. class `chanuser`

**Plik**: class-chan.cpp  
**Odpowiedzialność**: Użytkownik na kanale

```cpp
class chanuser
{
public:
    char *nick;
    char *ident;
    char *host;
    char *ip;                     // Jeśli resolve-users-hostname
    char *uid;                    // UID (ircv3)
    int flags;                    // FLAG_OP, FLAG_VOICE, etc.
    
    chan *channel;                // Odniesienie do kanału
    
    // Metody
    bool hasFlag(int flag);
    HANDLE* handle();             // Handle z userlist (lub NULL)
    char* fullMask();             // nick!ident@host
};
```

#### 6. class `ul` (userlist)

**Plik**: class-userlist.cpp  
**Odpowiedzialność**: Lista użytkowników i uprawnień

```cpp
class ul
{
public:
    HANDLE *first;                // Pierwszy handle
    time_t timestamp;             // Timestamp userlist
    unsigned long long SN;        // Serial number
    
    protmodelist *protlist[4];    // Ban, invite, exempt, reop
    
    // Metody
    HANDLE* addHandle(const char *name, ...);
    HANDLE* findHandle(const char *name);
    void removeHandle(const char *name);
    int load(const char *file);
    int save(const char *file);
    void autoSave();
    HANDLE* match(chanuser *u, chan *ch);
};
```

#### 7. struct `HANDLE`

**Plik**: classes.h  
**Odpowiedzialność**: Wpis w userlist

```cpp
struct HANDLE
{
    char *name;                               // Handle
    int flags[MAX_CHANNELS+1];                // Flagi (indeks 0 = globalne)
    ptrlist<HOSTLIST> *hosts;                 // Hostmaski
    ptrlist<ULADDR> *allowedIPs;              // Dozwolone IP
    char *pass;                               // Hasło (MD5)
    char *creation_time;
    char *created_by;
    
    HANDLE *next;                             // Linked list
    
    // Metody
    bool hasFlag(int flag, int channel_num);
    bool isMain();                            // Czy +H
    bool isLeaf();                            // Czy +L
};
```

#### 8. class `CONFIG`

**Plik**: classes.h, config-load.cpp  
**Odpowiedzialność**: Konfiguracja bota

```cpp
class CONFIG
{
public:
    char *file;                   // Plik konfiguracji
    int bottype;                  // BOT_MAIN, BOT_SLAVE, BOT_LEAF
    
    char handle[MAX_LEN];
    char nick[MAX_LEN];
    char ident[MAX_LEN];
    char realname[MAX_LEN];
    char pass[MAX_LEN];
    
    ptrlist<entServer> *server;       // Lista serwerów IRC
    ptrlist<entHub> *hub;             // Lista HUBów
    ptrlist<entListener> *listeners;  // Listenery
    entString *userlist_file;
    
    entHost *myipv4, *myipv6;
    
    // ...wiele innych opcji
};
```

---

## Protokoły komunikacji

### 1. Protokół IRC

**Parser**: parse-irc.cpp

```
Kierunek: IRC Server → Bot

Format: :[prefix] COMMAND [params] [:trailing]

Przykłady:
:nick!user@host PRIVMSG #channel :Hello
:server.com 001 mynick :Welcome to IRC
:nick!user@host JOIN :#channel
:nick!user@host MODE #channel +o target
```

**Obsługa w kodzie**:

```cpp
void parse_irc(char *data)
{
    char *prefix = NULL;
    char *command = NULL;
    char *params[MAX_IRC_PARAMS];
    
    // 1. Parsowanie
    if(*data == ':')
        prefix = extract_prefix(&data);
    command = extract_word(&data);
    parse_params(data, params);
    
    // 2. Routing na podstawie command
    if(!strcmp(command, "PRIVMSG"))
        handle_privmsg(prefix, params);
    else if(!strcmp(command, "JOIN"))
        handle_join(prefix, params);
    else if(!strcmp(command, "MODE"))
        handle_mode(prefix, params);
    // ... itd.
}
```

### 2. Protokół Botnet

**Parser**: parse-botnet.cpp, parse-hub.cpp, parse-bot.cpp

```
Kierunek: Bot ←→ Bot

Format: [prefix] COMMAND [args]

Przykłady:
MainBot USERLIST <timestamp> <SN> <compressed_data>
SlaveBot PING
MainBot CHATTR handle +o #channel
SlaveBot NEWUSER handle hostmask flags
```

**Hierarchia poleceń**:

1. **HUB → SLAVE/LEAF** (parse-hub.cpp):
   - `USERLIST` - Przesłanie userlist
   - `CHATTR` - Zmiana flag
   - `NEWUSER` - Dodanie użytkownika
   - `DELUSER` - Usunięcie użytkownika
   - `DIE` - Zamknięcie bota
   - `RESTART` - Restart bota
   - `JUMP` - Zmiana serwera IRC

2. **SLAVE/LEAF → HUB** (parse-bot.cpp):
   - `PING/PONG` - Keep-alive
   - `STATUS` - Status bota
   - `HOSTINFO` - Informacje o hoście

3. **Broadcast** (wszystkie boty):
   - `MSG` - Wiadomość na partyline
   - `NOTICE` - Notice na partyline

**Przykład implementacji**:

```cpp
int parse_botnet(inetconn *c, char *data)
{
    char *from, *cmd, *args;
    
    from = extract_word(&data);
    cmd = extract_word(&data);
    args = data;
    
    if(!strcmp(cmd, "PING"))
    {
        c->send("%s PONG", (const char*)ME.handle);
    }
    else if(!strcmp(cmd, "USERLIST"))
    {
        handle_userlist_update(from, args);
    }
    // ... etc
    
    // Hook dla modułów
    HOOK(botnet_command, botnet_command(c, cmd, args));
}
```

### 3. Protokół Partyline

**Parser**: partyline.cpp

```
Kierunek: User → Bot (przez telnet/IRC)

Format: .command [args]

Przykłady:
.bots
.bc MainBot status
.+user JanKowalski jan!*@*.example.com
.chattr JanKowalski +o #channel
```

**Routing komend**:

```cpp
void parse_owner(inetconn *c, char *data)
{
    // Sprawdź uprawnienia
    HANDLE *h = userlist.findHandle(c->name);
    if(!h || !h->hasFlag(HAS_P))
    {
        c->close("Unauthorized");
        return;
    }
    
    // Parsuj komendę
    char *cmd = extract_word(&data);
    
    if(!strcmp(cmd, ".bots"))
        cmd_bots(c);
    else if(!strcmp(cmd, ".bc"))
        cmd_botcommand(c, data);
    else if(!strcmp(cmd, ".+user"))
        cmd_adduser(c, data);
    // ... setki komend
}
```

---

## Zarządzanie pamięcią

### Kontenery własne

Psotnic implementuje własne kontenery zamiast STL (z powodów wydajnościowych i kontroli):

#### 1. `ptrlist<T>`

**Plik**: ptrlist.h

```cpp
template <class T> class ptrlist
{
private:
    struct node {
        T *data;
        node *next;
    };
    node *head;
    int entries;
    
public:
    // Dodawanie
    void addLast(T *obj);
    void addFirst(T *obj);
    
    // Usuwanie
    void remove(T *obj);
    void removeFirst();
    void clear();
    
    // Iterator
    class iterator {
        node *current;
    public:
        T* operator*();
        iterator& operator++();
        bool operator!();
    };
};
```

**Użycie**:
```cpp
ptrlist<chanuser> users;

chanuser *u = new chanuser();
users.addLast(u);

ptrlist<chanuser>::iterator i = users.begin();
for(; i; i++)
{
    chanuser *user = *i;
    // ...
}
```

#### 2. `hashlist<T>`

**Plik**: hashlist.h

```cpp
template <class T> class hashlist
{
private:
    ptrlist<T> **data;
    int size;
    
public:
    void add(T *obj);
    T* find(unsigned int hash);
    void remove(unsigned int hash);
};
```

**Wykorzystanie**: Cache DNS, szybkie wyszukiwanie

#### 3. `pstring<N>`

**Plik**: pstring.h

```cpp
template <int N=128> class pstring
{
private:
    char *data;
    int len;
    
public:
    pstring();
    pstring(const char *str);
    ~pstring();
    
    pstring& operator=(const char *str);
    operator const char*() const;
};
```

**Zastosowanie**: Dynamiczne stringi z automatycznym zarządzaniem pamięcią

### Alokacja i dealokacja

**Zasady**:

1. **Używaj new/delete** (nie malloc/free)
2. **RAII**: Konstruktor alokuje, destruktor zwalnia
3. **Unikaj wycieków**: Każdy `new` musi mieć odpowiadający `delete`

**Przykład**:

```cpp
// ŹLE
char *str = (char*)malloc(100);
// ... zapomnienie free()

// DOBRZE
pstring<> str = "Hello";
// Automatyczne zwolnienie w destruktorze
```

---

## System modułów

### Architektura modułów

```
┌─────────────────────────────────┐
│     MODULE.SO (dynamic lib)     │
│                                 │
│  extern "C" module* init() {   │
│    module *m = new module(...);│
│    m->hook_privmsg = ...;      │
│    return m;                    │
│  }                              │
└─────────────────────────────────┘
           ↓ dlopen()
┌─────────────────────────────────┐
│         PSOTNIC CORE            │
│                                 │
│  modules.addLast(m);           │
│                                 │
│  HOOK(privmsg, ...) {          │
│    for each module:             │
│      if(m->hook_privmsg)       │
│        m->hook_privmsg(...);   │
│  }                              │
└─────────────────────────────────┘
```

### Loading modułu

**Kod w main.cpp / functions.cpp**:

```cpp
int loadModule(const char *name)
{
    void *handle = dlopen(name, RTLD_NOW | RTLD_GLOBAL);
    if(!handle)
    {
        printf("dlopen error: %s\n", dlerror());
        return 0;
    }
    
    // Pobierz funkcję init()
    typedef module* (*initfunc)();
    initfunc init = (initfunc)dlsym(handle, "init");
    
    if(!init)
    {
        printf("dlsym error: %s\n", dlerror());
        dlclose(handle);
        return 0;
    }
    
    // Wywołaj init()
    module *m = init();
    m->handle = handle;
    
    // Dodaj do listy
    modules.addLast(m);
    
    printf("[+] Loaded module: %s v%s by %s\n",
           m->name, m->version, m->author);
    
    return 1;
}
```

### Struktura class `module`

**Plik**: classes.h

```cpp
class module
{
public:
    char *name;
    char *author;
    char *version;
    void *handle;                     // dlopen handle
    
    // HOOKI - wskaźniki do funkcji
    int (*hook_privmsg)(inetconn*, char*, char*, char*);
    int (*hook_notice)(inetconn*, char*, char*, char*);
    int (*hook_join)(inetconn*, char*, char*);
    int (*hook_part)(inetconn*, char*, char*, char*);
    int (*hook_quit)(inetconn*, char*, char*);
    int (*hook_kick)(inetconn*, char*, char*, char*, char*);
    int (*hook_mode)(inetconn*, char*, char*, char*, char*);
    int (*hook_nick)(inetconn*, char*, char*);
    int (*hook_topic)(inetconn*, char*, char*, char*);
    int (*hook_invite)(inetconn*, char*, char*);
    int (*hook_ctcp)(inetconn*, char*, char*, char*);
    
    int (*hook_timer)();
    int (*hook_userlistLoaded)();
    int (*hook_connected_to_irc)();
    int (*hook_disconnected_from_irc)();
    int (*hook_registered_on_irc)();
    int (*hook_botnet_command)(inetconn*, char*, char*);
    int (*hook_rawirc)(char*);
    
    // Konstruktor
    module(const char *n, const char *a, const char *v);
};
```

### Makro HOOK

**Plik**: defines.h

```cpp
#define HOOK(name, code) \
    do { \
        ptrlist<module>::iterator m = modules.begin(); \
        for(; m; m++) \
        { \
            if((*m)->hook_##name) \
            { \
                if((*m)->hook_##name code) \
                    break; \
            } \
        } \
    } while(0)
```

**Użycie**:

```cpp
// W parse-irc.cpp
HOOK(privmsg, (c, mask, to, msg));

// Rozwija się do:
for each module m:
    if(m->hook_privmsg)
        if(m->hook_privmsg(c, mask, to, msg))
            break;  // Moduł zwrócił 1 = zatrzymaj
```

---

## Bezpieczeństwo i kryptografia

### 1. Blowfish (szyfrowanie konfiguracji)

**Plik**: class-blowfish.cpp

```cpp
class Blowfish
{
private:
    unsigned long P[18];
    unsigned long S[4][256];
    
public:
    void init(const char *key, int keylen);
    void encrypt(unsigned long *xl, unsigned long *xr);
    void decrypt(unsigned long *xl, unsigned long *xr);
};
```

**Użycie w config-load.cpp**:

```cpp
void loadConfig(const char *file)
{
    // 1. Wczytaj zaszyfrowany plik
    unsigned char *encrypted = read_file(file);
    
    // 2. Inicjalizuj Blowfish z hasłem
    Blowfish bf;
    bf.init(user_password, strlen(user_password));
    
    // 3. Deszyfruj
    for(int i = 0; i < len; i += 8)
    {
        bf.decrypt(&encrypted[i], &encrypted[i+4]);
    }
    
    // 4. Parsuj odszyfrowaną konfigurację
    parse_config(encrypted);
}
```

### 2. MD5 (hashowanie haseł)

**Plik**: md5.cpp

```cpp
void MD5Init(CUSTOM_MD5_CTX *ctx);
void MD5Update(CUSTOM_MD5_CTX *ctx, unsigned char *buf, unsigned int len);
void MD5Final(unsigned char digest[16], CUSTOM_MD5_CTX *ctx);
```

**Użycie**:

```cpp
// Hashowanie hasła
CUSTOM_MD5_CTX ctx;
unsigned char digest[16];

MD5Init(&ctx);
MD5Update(&ctx, (unsigned char*)password, strlen(password));
MD5Final(digest, &ctx);

// Konwersja do hex
char hex[33];
for(int i = 0; i < 16; i++)
    sprintf(hex + i*2, "%02x", digest[i]);
```

**Przechowywanie w userlist**:

```cpp
HANDLE->pass = strdup(hex);  // 32-znakowy hex string
```

### 3. ISAAC (generator liczb losowych)

**Plik**: isaac.h

```cpp
template <int alpha, class T> class QTIsaac
{
private:
    T randrsl[alpha];
    T randcnt;
    
public:
    void srand(T seed);
    T rand();
};

extern QTIsaac<8, int> Isaac;
```

**Użycie**:

```cpp
// Inicjalizacja (w main)
Isaac.srand(time(NULL) ^ getpid());

// Generowanie
int random = Isaac.rand();
```

**Zastąpienie stdlib rand()**:

```cpp
#define rand hide_this_function
#undef rand

int rand() {
    return Isaac.rand();
}
```

### 4. SSL/TLS

**Plik**: class-inet.cpp

```cpp
#ifdef HAVE_SSL
struct inetconn {
    SSL *ssl;
    SSL_CTX *ssl_ctx;
};

// Inicjalizacja SSL
SSL_library_init();
ssl_ctx = SSL_CTX_new(SSLv23_method());
SSL_CTX_use_certificate_file(ssl_ctx, "server.crt", SSL_FILETYPE_PEM);
SSL_CTX_use_PrivateKey_file(ssl_ctx, "server.key", SSL_FILETYPE_PEM);

// Połączenie SSL
ssl = SSL_new(ssl_ctx);
SSL_set_fd(ssl, fd);
SSL_connect(ssl);  // Klient
// lub
SSL_accept(ssl);   // Serwer

// I/O
SSL_read(ssl, buf, len);
SSL_write(ssl, buf, len);
#endif
```

### 5. Seed obfuscation

**Plik**: scram.cpp, make-hiddenseed

Psotnic używa techniki "seed hiding" do utrudnienia reverse engineering:

```bash
# Generowanie ukrytych funkcji seed
./make-hiddenseed > seed.h

# Zawiera funkcje o losowych nazwach:
void func_a83b2c9d() { /* init seed */ }
```

**Cel**: Utrudnienie dekompilacji i analizy statycznej

---

## Diagramy przepływu danych

### Przychodzący PRIVMSG

```
IRC Server → Bot

1. select() wykrywa dane na net.irc.fd
         ↓
2. readln() → buf = ":nick!user@host PRIVMSG #chan :Hello"
         ↓
3. HOOK(rawirc, rawirc(buf))  [moduły mogą obejrzeć surową linię]
         ↓
4. parse_irc(buf)
         ↓
5. Wykrycie komendy: PRIVMSG
         ↓
6. Parsowanie: mask="nick!user@host", to="#chan", msg="Hello"
         ↓
7. Sprawdzenie czy to kanał czy prywatna wiadomość
         ↓
8. HOOK(privmsg, privmsg(c, mask, to, msg))  [moduły obsługują]
         ↓
9. Jeśli moduł zwróci 1: STOP, inaczej kontynuuj
         ↓
10. Obsługa botcmd (jeśli msg zaczyna się od prefiksu)
```

### Wysyłanie PRIVMSG

```
ME.sendPrivmsg("#chan", "Hello")

1. Formatowanie wiadomości
         ↓
2. Sprawdzenie penalty (flood protection)
         ↓
3a. Jeśli penalty < limit:
    net.irc.send("PRIVMSG #chan :Hello")
         ↓
    Dodaj do bufora zapisu
         
3b. Jeśli penalty >= limit:
    Dodaj do queue (fifo)
         ↓
    Wyślij później (w main loop, gdy penalty spadnie)
```

### Synchronizacja userlist

```
HUB → SLAVE

1. SLAVE łączy się z HUB
         ↓
2. HUB sprawdza czy SLAVE jest autoryzowany
         ↓
3. HUB kompresuje userlist
         ↓
4. HUB wysyła: "USERLIST <timestamp> <SN> <compressed>"
         ↓
5. SLAVE odbiera i dekompresuje
         ↓
6. SLAVE porównuje timestamp i SN
         ↓
7a. Jeśli HUB nowszy: SLAVE zastępuje swoją userlist
7b. Jeśli SLAVE nowszy: SLAVE wysyła swoją userlist do HUB
7c. Jeśli równe: Brak akcji
         ↓
8. Synchronizacja zakończona
```

---

## Optymalizacje wydajności

### 1. Penalty System

Zapobiega flood'owi na IRC:

```cpp
class penal
{
private:
    int value;
    time_t last_update;
    
public:
    void update()  // Wywoływane co sekundę
    {
        if(value > 0) value--;
    }
    
    void increase(int amount)
    {
        value += amount;
    }
    
    operator int() { return value; }
};

// Użycie
penalty.increase(2);  // Każda linia IRC = +2 penalty
if(penalty < 10)
    send_to_irc();
else
    add_to_queue();
```

### 2. Mode Queue

Łączenie wielu zmian trybu w jedną komendę:

```cpp
class modeQ
{
private:
    struct entry {
        char mode;      // '+' lub '-'
        char flag;      // 'o', 'v', 'b', etc.
        char *target;
    };
    ptrlist<entry> queue;
    
public:
    void add(char mode, char flag, const char *target);
    void flush();  // Wysłanie: MODE #chan +ooo-vv nick1 nick2 nick3 nick4 nick5
};
```

### 3. DNS Caching

**Plik**: class-adns.cpp

```cpp
class adns
{
private:
    hashlist<host2ip> *cache;  // Hash: hostname → IP
    time_t ttl;
    
public:
    host2ip* getIp(const char *host)
    {
        // 1. Sprawdź cache
        host2ip *h = cache->find(hash(host));
        if(h && (NOW - h->creation()) < ttl)
            return h;
            
        // 2. Cache miss - zakolejkuj resolve
        resolv(host);
        return NULL;
    }
};
```

---

## Debugging i diagnostyka

### 1. IRC Backtrace

```cpp
#ifdef HAVE_IRC_BACKTRACE
char irc_buf[IRC_BUFS][MAX_LEN];  // Cykliczny bufor
int current_irc_buf = 0;

// W parse-irc
n = net.irc.readln(irc_buf[current_irc_buf], MAX_LEN);
parse_irc(irc_buf[current_irc_buf]);
if(++current_irc_buf == IRC_BUFS)
    current_irc_buf = 0;

// Po crash
void dumpIrcBacktrace()
{
    for(int i = 0; i < IRC_BUFS; i++)
        printf("%s\n", irc_buf[i]);
}
#endif
```

### 2. Debug mode

```cpp
#ifdef HAVE_DEBUG
#define DEBUG(x) x
int debug = 1;
#else
#define DEBUG(x)
#endif

DEBUG(printf("[D] Some debug info\n"));
```

### 3. Core dumps

```cpp
// W main()
struct rlimit rlim;
rlim.rlim_cur = RLIM_INFINITY;
rlim.rlim_max = RLIM_INFINITY;
setrlimit(RLIMIT_CORE, &rlim);  // Włącz core dumps
```

---

## Podsumowanie architektury

**Kluczowe punkty**:

1. **Event-driven**: Jednowątkowa pętla select()
2. **Multiplexing**: Obsługa wielu połączeń równocześnie
3. **Modułowość**: System hooków i dynamicznych modułów
4. **Hierarchia**: Hub/Slave/Leaf dla skalowalności
5. **Bezpieczeństwo**: Szyfrowanie (Blowfish), hashowanie (MD5), SSL
6. **Optymalizacje**: Penalty, mode queue, DNS cache
7. **Własne kontenery**: ptrlist, hashlist, pstring

**Diagram ogólny**:

```
                    ┌──────────────────┐
                    │   MODUŁY (.so)   │
                    └────────┬─────────┘
                            │ hooki
        ┌───────────────────┴──────────────────┐
        │         PSOTNIC CORE (main)          │
        │  ┌──────────────────────────────┐   │
        │  │   EVENT LOOP (select)        │   │
        │  └──────────────────────────────┘   │
        │  ┌──────────┐  ┌──────────────┐    │
        │  │ userlist │  │  chanlist    │    │
        │  └──────────┘  └──────────────┘    │
        │  ┌──────────┐  ┌──────────────┐    │
        │  │ config   │  │  inet/conn   │    │
        │  └──────────┘  └──────────────┘    │
        └───────────────────┬──────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        │                                      │
   ┌────▼────┐  ┌─────▼──────┐  ┌──────▼─────┐
   │   IRC   │  │   BOTNET   │  │  PARTYLINE │
   │ Server  │  │  Hub/Bots  │  │   Users    │
   └─────────┘  └────────────┘  └────────────┘
```

---

*Koniec dokumentacji technicznej*
