# Komenda .bc cfg - Dokumentacja

## Przegląd

Komenda `.bc` (Botnet Control) pozwala głównemu ownerowi (z flagą `+x`) na zdalne zarządzanie konfiguracją botów w botnecie. Komenda `cfg` służy do odczytu i modyfikacji zmiennych konfiguracyjnych.

## Składnia

```
.bc <bothandle> cfg [zmienna] [wartość]
```

### Parametry

| Parametr | Opis |
|----------|------|
| `bothandle` | Handle bota, którego konfigurację chcemy zmienić |
| `zmienna` | Opcjonalna - nazwa zmiennej do wyświetlenia/modyfikacji |
| `wartość` | Opcjonalna - nowa wartość zmiennej |

## Tryby użycia

### 1. Wyświetlenie całej konfiguracji

```
.bc hub cfg
```

Wyświetla wszystkie zmienne konfiguracyjne bota.

### 2. Wyświetlenie konkretnej zmiennej

```
.bc hub cfg nick
.bc hub cfg realname
.bc hub cfg server
```

Wyświetla wartość podanej zmiennej lub wszystkich zmiennych zaczynających się od podanego prefiksu.

### 3. Zmiana wartości zmiennej

```
.bc hub cfg nick NowyNick
.bc hub cfg realname Nowy opis bota
```

Ustawia nową wartość zmiennej.

### 4. Zmienne wielokrotne (server, alt, listen)

Dla zmiennych, które mogą występować wielokrotnie, używa się prefiksów `+` (dodaj) i `-` (usuń):

**Dodanie serwera:**
```
.bc hub cfg +server irc.example.com 6667
.bc hub cfg +server ssl:irc.example.com 6697
```

**Usunięcie serwera:**
```
.bc hub cfg -server irc.example.com 6667
```

## Zapisywanie zmian

**WAŻNE:** Zmiany konfiguracji nie są automatycznie zapisywane. Aby je utrwalić:

```
.bc <bothandle> cfg-save
```

## Dostępne zmienne konfiguracyjne

### Podstawowe

| Zmienna | Typ | Opis |
|---------|-----|------|
| `nick` | word(1-15) | Nick bota na IRC |
| `altnick` | word(1-15) | Alternatywny nick |
| `nickappend` | word(1-255) | Znaki do dodania gdy nick zajęty (domyślnie: `_-^|\``) |
| `realname` | string(1-255) | Realname bota (domyślnie: "Phantom") |
| `ident` | word(1-12) | Ident bota |
| `handle` | word(1-15) | Handle bota w botnecie |

### Sieć

| Zmienna | Typ | Opis |
|---------|-----|------|
| `server` | host port [pass] | Serwer IRC (wielokrotna) |
| `hub` | host port pass [handle] | Adres huba |
| `alt` | host port | Alternatywny hub (wielokrotna) |
| `myipv4` | host | Adres IPv4 do bindowania |
| `myipv6` | host | Adres IPv6 do bindowania |
| `vhost` | host | Virtual host |

### Listen (nasłuchiwanie)

| Zmienna | Typ | Opis |
|---------|-----|------|
| `listen` | [ssl:]host port [options] | Port nasłuchiwania (wielokrotna) |

Opcje listen:
- `bots` - tylko połączenia od botów
- `users` - tylko połączenia od użytkowników
- `all` - wszystkie połączenia (domyślnie)

Przykłady:
```
.bc hub cfg +listen ssl:0.0.0.0 33100 bots
.bc hub cfg +listen ssl:0.0.0.0 33101 users
.bc hub cfg +listen 0.0.0.0 5555 all
```

### SASL

| Zmienna | Typ | Opis |
|---------|-----|------|
| `sasl-mechanism` | int(0-5) | Mechanizm SASL (0=wyłączony) |
| `sasl-username` | string(1-255) | Nazwa użytkownika SASL |
| `sasl-password` | string(1-255) | Hasło SASL |

### Moduły

| Zmienna | Typ | Opis |
|---------|-----|------|
| `load` | path | Moduł do załadowania (wielokrotna) |
| `debugLoad` | path | Moduł do załadowania w trybie debug |

### Inne

| Zmienna | Typ | Opis |
|---------|-----|------|
| `userlist` | word(1-255) | Plik userlisty |
| `logfile` | word(1-16) | Plik logu |
| `ownerpass` | md5hash | Hasło ownera (wielokrotna) |
| `dontfork` | bool | Nie forkuj do tła |
| `keepnick` | bool | Utrzymuj nick |
| `botnetword` | word | Słowo identyfikacyjne botnetu |
| `ctcptype` | int(-1-8) | Typ odpowiedzi CTCP |
| `partyline-servername` | word | Nazwa serwera partyline |

### DNS (jeśli skompilowano z ADNS)

| Zmienna | Typ | Opis |
|---------|-----|------|
| `resolve-threads` | int(0-256) | Liczba wątków resolvera |
| `domain-ttl` | time | TTL cache DNS |

## Przykłady użycia

### Zmiana serwerów IRC

```
.bc leaf1 cfg server
.bc leaf1 cfg -server stary.irc.pl 6667
.bc leaf1 cfg +server ssl:nowy.irc.pl 6697
.bc leaf1 cfg-save
```

### Konfiguracja SASL

```
.bc hub cfg sasl-mechanism 1
.bc hub cfg sasl-username mojnick
.bc hub cfg sasl-password mojehaslo
.bc hub cfg-save
```

## Wymagane uprawnienia

Komenda `.bc cfg` wymaga flagi `+x` (główny owner) na poziomie globalnym.

## Implementacja

Kod źródłowy:
- `botcmd.cpp:113-124` - funkcja `bc_cfg()`
- `botcmd.cpp:126-138` - funkcja `bc_cfg_save()`
- `class-options.cpp:115-135` - funkcja `parseUser()`
- `class-options.cpp:385-518` - definicje zmiennych CONFIG

## Uwagi

1. Zmiany nie są zapisywane automatycznie - zawsze użyj `.bc bot cfg-save`
2. Niektóre zmienne są read-only po uruchomieniu (np. `botnetword`, `ctcptype`)
3. Zmienne wielokrotne wymagają prefiksów `+`/`-`
4. Host z SSL poprzedzamy prefiksem `ssl:` np. `ssl:irc.example.com`
5. Błędne wartości są odrzucane z komunikatem błędu
