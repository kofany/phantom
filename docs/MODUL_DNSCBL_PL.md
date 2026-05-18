# Moduł DNSCBL - Dokumentacja

## Phantom Shield - Ochrona przed botnetami i proxy

### Przegląd

Moduł **dnscbl** to zaawansowany system ochrony kanałów IRC przed niechcianymi użytkownikami, bazujący na zewnętrznych bazach danych DNS Blackhole List (DNSBL). Główną funkcją modułu jest weryfikacja każdego użytkownika dołączającego do kanału w bazie **DroneBL** oraz automatyczna ochrona przed masowym dołączaniem (massjoin).

### Kluczowe funkcje

#### 1. Weryfikacja DNSBL w czasie rzeczywistym
- Każdy JOIN jest weryfikowany w bazie DroneBL
- Obsługa adresów IPv4 i IPv6
- Inteligentny system cache'owania zapytań DNS
- Minimalne opóźnienie dzięki asynchronicznym zapytaniom

#### 2. Ochrona przed massjoin
- Automatyczne wykrywanie gwałtownego wzrostu liczby joinów
- Natychmiastowe ustawienie trybów `+im` (moderated + invite-only) na czas blokady
- Konfigurowalny próg wykrywania (domyślnie: 5 joinów w 10 sekund)
- Automatyczne usunięcie trybów po upływie okresu blokady (domyślnie: 5 minut)

#### 3. Inteligentny system banów
- Automatyczny kick + ban użytkowników znalezionych na blackliście
- Profesjonalne opisy przyczyn bana z kodami DroneBL
- Konfigurowalny czas trwania bana
- Maskowanie banów: `*!ident@host`

### Kody DroneBL i ich znaczenie

Moduł rozpoznaje następujące kody odpowiedzi z DroneBL:

| Kod | Znaczenie |
|-----|-----------|
| 3   | IRC Drone (bot IRC) |
| 5   | Bottler (sieć botów) |
| 6   | Nieznany spambot lub drone |
| 7   | DDOS Drone (bot do ataków DDoS) |
| 8   | SOCKS Proxy |
| 9   | HTTP Proxy |
| 10  | ProxyChain (łańcuch proxy) |
| 13  | Brute force attackers (ataki siłowe) |
| 14  | Open Wingate Proxy |
| 15  | Compromised router / gateway (skompromitowany router) |
| 17  | Automatically determined botnet IPs (automatycznie wykryte IP botnetu) |
| 255 | Uncategorized threat class (niesklasyfikowane zagrożenie) |

### Konfiguracja

#### Ustawienia globalne (dnsset)

Konfiguracja globalna dotyczy całego bota:

```
.bc <bot> dnsset enabled <0|1>
```
Włącza/wyłącza całkowicie moduł DNSCBL (domyślnie: 1)

```
.bc <bot> dnsset cache-ttl <sekundy>
```
Określa jak długo wyniki zapytań DNS są przechowywane w cache (domyślnie: 1800 sekund = 30 minut)

```
.bc <bot> dnsset ban-time <sekundy>
```
Czas trwania bana dla użytkowników na blackliście (domyślnie: 7200 sekund = 2 godziny)

```
.bc <bot> dnsset massjoin-count <liczba>
```
Liczba joinów w określonym czasie, która uruchamia ochronę massjoin (domyślnie: 5)

```
.bc <bot> dnsset massjoin-time <sekundy>
```
Okno czasowe dla wykrywania massjoin (domyślnie: 10 sekund)

```
.bc <bot> dnsset massjoin-lockdown <sekundy>
```
Czas trwania blokady +im po wykryciu massjoin (domyślnie: 300 sekund = 5 minut)

#### Ustawienia per-kanał (dnschanset)

Konfiguracja dla konkretnych kanałów:

```
.bc <bot> dnschanset #kanał protection <0|1>
```
Włącza/wyłącza ochronę DNSCBL na danym kanale (domyślnie: 1)

#### Wyświetlanie aktualnych ustawień

Wyświetl wszystkie ustawienia globalne:
```
.bc <bot> dnsset
```

Wyświetl ustawienia dla konkretnego kanału:
```
.bc <bot> dnschanset #kanał
```

#### Status i diagnostyka (Phantom)

Moduł DNSCBL oferuje dwa sposoby sprawdzania statusu ochrony:

**1. Lokalna komenda partyline (preferowana):**
```
.dnsstatus                      # Status globalny i wszystkie kanały
.dnsstatus #kanał               # Status dla konkretnego kanału
```
Komenda lokalna działa bezpośrednio na bocie, do którego jesteś podłączony przez partyline.
**Nie używaj** `.bc` z komendą `.dnsstatus` - to komenda lokalna!

**2. Zdalna komenda botnet (alternatywa):**
```
.bc <bot> dnsstatus              # Status zdalnego bota
.bc <bot> dnsstatus #kanał       # Status kanału na zdalnym bocie
```
Komenda zdalna działa przez sieć botnet i pozwala sprawdzić status innego bota.

**Różnica między komendami:**
- `.dnsstatus` - komenda **lokalna**, bez `.bc` prefix
- `.bc <bot> dnsstatus` - komenda **zdalna**, przez botnet

**Przykład wyjścia:**
```
[DNSCBL Protection Status]
Global Protection: ENABLED
Ban Duration: 7200 seconds
Cache: 15 entries (TTL: 1800 seconds)
Massjoin Protection: 5 joins in 10 seconds triggers +im for 300 seconds

[Active Channels]
  #control: ON
  #test: OFF

[Configuration Commands]
  .bc <bot> dnsset <key> <value> - Configure global settings
  .bc <bot> dnschanset <#channel> <key> <value> - Configure channel

[Available Settings]
  Global: enabled, cache-ttl, ban-time, massjoin-count, massjoin-time, massjoin-lockdown
  Channel: protection
```

**Wymagania:**
- Flaga HAS_N (administracja sieci)
- Dostęp do partyline
- Załadowany moduł dnscbl.so

### Przykłady użycia

#### Podstawowa konfiguracja

```
# Włącz moduł
.bc bot1 dnsset enabled 1

# Ustaw czas bana na 1 godzinę
.bc bot1 dnsset ban-time 3600

# Zwiększ czułość massjoin (8 joinów w 15 sekund)
.bc bot1 dnsset massjoin-count 8
.bc bot1 dnsset massjoin-time 15

# Wydłuż czas blokady massjoin do 10 minut
.bc bot1 dnsset massjoin-lockdown 600
```

#### Konfiguracja per-kanał

```
# Wyłącz ochronę na #testowy
.bc bot1 dnschanset #testowy protection 0

# Włącz ochronę na #główny
.bc bot1 dnschanset #główny protection 1
```

#### Optymalizacja wydajności

```
# Zwiększ czas cache dla zmniejszenia liczby zapytań DNS
.bc bot1 dnsset cache-ttl 3600

# Zmniejsz czułość massjoin dla mniejszych kanałów
.bc bot1 dnsset massjoin-count 10
.bc bot1 dnsset massjoin-time 20
```

### Scenariusze działania

#### Scenariusz 1: Normalny JOIN

1. Użytkownik dołącza do kanału
2. Moduł sprawdza czy użytkownik ma flagi (+o, +v, +f, etc.) - jeśli tak, pomija weryfikację
3. Moduł wyodrębnia IP użytkownika (IPv4 lub IPv6)
4. Sprawdza cache - jeśli IP już był sprawdzany, używa wyniku z cache
5. Jeśli nie ma w cache, wykonuje zapytanie DNS do DroneBL
6. Jeśli IP **nie jest** na blackliście - użytkownik pozostaje na kanale
7. Jeśli IP **jest** na blackliście:
   - Bot kickuje użytkownika z profesjonalnym komunikatem
   - Nakłada bana na czas określony w `ban-time`
   - Loguje zdarzenie w konsoli bota

#### Scenariusz 2: Massjoin

1. W ciągu 10 sekund (domyślnie) dołącza 5 użytkowników (domyślnie)
2. Moduł wykrywa massjoin
3. Bot natychmiast nakłada tryby `+i` (invite-only) i `+m` (moderated)
4. Każdy kolejny JOIN jest nadal weryfikowany w DNSBL
5. Po 5 minutach (domyślnie) bot automatycznie usuwa tryby `+i` i `+m`
6. Kanał powraca do normalnego stanu

#### Scenariusz 3: Bot wykrywa znanego bota IRC

```
>>> JOIN: EvilBot!bad@1.2.3.4 joins #channel
[DNSCBL] Banning EvilBot (1.2.3.4) from #channel - Listed on DroneBL [3: IRC Drone]
<<< MODE #channel +b *!bad@1.2.3.4
<<< KICK #channel EvilBot :DroneBL [3]: IRC Drone - Your IP (1.2.3.4) is listed on abuse database. Contact network support if you believe this is an error.
```

### Działanie z innymi modułami

Moduł DNSCBL współpracuje z innymi modułami Psotnic:

- **vctrl** - użytkownicy z +v mogą mieć immunitet przed banem DNSCBL jeśli mają odpowiednie flagi
- **noautorejoin** - po banie DNSCBL, próba ponownego wejścia zostanie zablokowana również przez noautorejoin
- **nogarbage** - łączone działanie obu modułów zapewnia kompleksową ochronę przed spamem

### Monitorowanie i diagnostyka

#### Logi bota

Moduł loguje wszystkie istotne zdarzenia do konsoli bota:

```
[DNSCBL] Module loaded - DroneBL protection active
[DNSCBL] Massjoin protection: 5 joins in 10s triggers +im for 300s
[DNSCBL] Mass join detected on #channel - setting +im for 300 seconds
[DNSCBL] Banning nick (1.2.3.4) from #channel - Listed on DroneBL [3: IRC Drone]
[DNSCBL] Mass join lockdown expired on #channel - removing +im
[DNSCBL] Cleaned up 42 expired cache entries
```

#### Statystyki cache

Okresowo moduł czyści stare wpisy z cache (co 5 minut). Każde czyszczenie jest logowane z liczbą usuniętych wpisów.

### Bezpieczeństwo i ochrona

#### Wyjątki od weryfikacji

Następujący użytkownicy są automatycznie wykluczeni z weryfikacji DNSCBL:

- Użytkownicy z flagą `+o` (op) w userliście bota
- Użytkownicy z flagą `+v` (voice) w userliście bota
- Użytkownicy z flagą `+f` (friend) w userliście bota
- Użytkownicy z innymi flagami ochronnymi (`+m`, `+n`, etc.)

#### Fałszywe alarmy

W przypadku fałszywego pozytywu (legalny użytkownik na blackliście):

1. Właściciel kanału może dodać użytkownika do userlisty bota z flagą `+f`
2. Użytkownik może skontaktować się z administratorem DroneBL w celu usunięcia z listy
3. Tymczasowo można wyłączyć ochronę na kanale: `.bc bot dnschanset #kanał protection 0`

### Wydajność

#### Optymalizacja zapytań DNS

- Cache zmniejsza liczbę zapytań do DroneBL o ~80-90%
- Domyślny TTL cache (30 minut) zapewnia równowagę między aktualnością a wydajnością
- Asynchroniczne zapytania DNS nie blokują głównej pętli bota

#### Zużycie zasobów

- Minimalny narzut CPU (~1-2% przy intensywnym ruchu)
- Pamięć: ~100-200 KB dla cache (~1000 wpisów)
- Przepustowość: ~50 bajtów na zapytanie DNS

### Rozwiązywanie problemów

#### Problem: Bot nie banuje użytkowników na blackliście

**Możliwe przyczyny:**
1. Moduł jest wyłączony globalnie - sprawdź `.bc bot dnsset enabled`
2. Ochrona wyłączona na kanale - sprawdź `.bc bot dnschanset #kanał protection`
3. Bot nie ma opa na kanale - bot musi mieć @
4. Użytkownik ma flagi w userliście - sprawdź `.whois nick`

#### Problem: Zbyt wiele fałszywych alarmów massjoin

**Rozwiązanie:**
```
# Zwiększ próg wykrywania
.bc bot dnsset massjoin-count 10
.bc bot dnsset massjoin-time 20
```

#### Problem: Cache nie działa poprawnie

**Rozwiązanie:**
```
# Zwiększ TTL cache
.bc bot dnsset cache-ttl 7200
```

### Najlepsze praktyki

1. **Dla małych kanałów (<20 użytkowników):**
   ```
   .bc bot dnsset massjoin-count 8
   .bc bot dnsset massjoin-time 15
   .bc bot dnsset ban-time 3600
   ```

2. **Dla średnich kanałów (20-100 użytkowników):**
   ```
   .bc bot dnsset massjoin-count 5
   .bc bot dnsset massjoin-time 10
   .bc bot dnsset ban-time 7200
   ```

3. **Dla dużych kanałów (>100 użytkowników):**
   ```
   .bc bot dnsset massjoin-count 10
   .bc bot dnsset massjoin-time 10
   .bc bot dnsset massjoin-lockdown 600
   .bc bot dnsset cache-ttl 3600
   ```

4. **Dla kanałów publicznych z dużym ruchem:**
   - Rozważ zwiększenie `massjoin-count` do 15-20
   - Wydłuż `massjoin-lockdown` do 10-15 minut
   - Zwiększ `cache-ttl` do 1 godziny

### Integracja z setup

Aby automatycznie ładować moduł przy starcie bota:

1. Edytuj plik konfiguracyjny bota (`phantom.cfg` lub podobny)
2. Dodaj w sekcji `load`:
   ```
   load modules/dnscbl.so
   ```

3. Ustaw domyślną konfigurację w pliku startowym:
   ```bash
   #!/bin/bash
   ./phantom phantom.cfg
   # Po załadowaniu połącz się przez partyline i skonfiguruj:
   # .bc bot dnsset enabled 1
   # .bc bot dnsset ban-time 7200
   # itd.
   ```

### Plik konfiguracyjny

Moduł automatycznie zapisuje konfigurację do pliku:
```
modules/dnscbl.txt
```

Format pliku:
```
# DNSCBL Protection Module Configuration
# Phantom

dnsset enabled 1
dnsset cache-ttl 1800
dnsset ban-time 7200
dnsset massjoin-count 5
dnsset massjoin-time 10
dnsset massjoin-lockdown 300
dnschanset #channel protection 1
```

### API dla developerów

Jeśli tworzysz własne moduły, możesz wykorzystać custom data storage:

```cpp
// Pobranie danych kanału DNSCBL
dnscbl_channel_data *data = (dnscbl_channel_data*)ch->customData("dnscbl");
if(data) {
    // Sprawdź czy trwa lockdown
    if(data->tracker.is_lockdown()) {
        // Kanał jest w trybie ochronnym
    }
}
```

### Licencja i credits

**Moduł:** dnscbl
**Wersja:** 1.0
**Autor:** Phantom contributors
**Bazowane na:** PT-S DNSBL (moduł Eggdrop Tcl)
**Licencja:** GNU GPL v2

### Wsparcie

W razie problemów:
1. Sprawdź logi bota w konsoli
2. Przejrzyj dokumentację ponownie
3. Sprawdź status DroneBL: https://dronebl.org/
4. Upewnij się że DNS resolver działa poprawnie

### Zobacz także

- `docs/DOKUMENTACJA_PL.md` - Pełna dokumentacja Psotnic
- `docs/KOMENDY_PARTYLINE_PL.md` - Lista wszystkich komend partyline
- `docs/ARCHITEKTURA_TECHNICZNA_PL.md` - Architektura systemu modułów

---

**Phantom** - Profesjonalna ochrona kanałów IRC
