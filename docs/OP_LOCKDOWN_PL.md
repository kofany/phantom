# Op-Lockdown — dokumentacja

## Co to jest?

Op-lockdown to mechanizm bezpieczenstwa kanalu, ktory **blokuje automatyczne opowanie** (nadawanie statusu operatora @) uzytkownikom ponizej flagi `+n`. Gdy op-lockdown jest aktywny, tylko uzytkownicy z flaga `+n` (owner) lub wyzsza otrzymuja autoop. Wszyscy pozostali (np. z `+o`, `+m`) sa pomijani.

Jest to "tryb awaryjny" — wlaczasz go gdy ktos naduzyl uprawnien na kanale lub gdy chcesz tymczasowo ograniczyc kto dostaje opa.

## Jak wlaczyc?

### Przez partyline

```
.chset #kanal op-lockdown ON
```

Wymaga flagi `+N` (globalnej lub na kanale).

### Przez panel webowy

W widoku szczegolowym kanalu (zakladka Chanset) zmien `op-lockdown` na `ON`. Mozna tez uzyc WebAPI:

```json
{"type": "set_chanset", "channel": "#kanal", "var": "op-lockdown", "value": "ON"}
```

### Automatycznie (system idiots)

Op-lockdown wlacza sie **sam**, jesli ustawisz chanset `idiots` na wartosc `6`:

```
.chset #kanal idiots 6
```

Po wykryciu naruszenia (patrz nizej) bot automatycznie aktywuje lockdown i wyswietla komunikat:

> Op lockdown enabled on #kanal - autoop disabled for users below +n

## Jak wylaczyc?

### Przez partyline

```
.chset #kanal op-lockdown OFF
```

### Przez komende IRC

Mozna wyslac na kanale lub do bota:

```
delock <haslo> #kanal
```

Wymaga flagi `+n` i poprawnego hasla uzytkownika.

### Przez panel webowy

Gdy lockdown jest aktywny, w panelu pojawia sie czerwony banner z przyciskiem "Wylacz op-lockdown".

## Co triggeruje automatyczny lockdown?

Gdy `idiots` = `6`, lockdown wlacza sie automatycznie po wykryciu jednego z ponizszych naruszen:

### 1. Nielegalne opowanie (+o)

Ktos bez odpowiednich uprawnien nadaje operatora innym uzytkownikom.

**Warunki triggerowania:**

| Flagi osoby opajacej | Pojedyncze +o | Masowe +oo / +ooo |
|---|---|---|
| Bez `+m` | Triggeruje | Triggeruje |
| `+m` bez `+n` | Nie triggeruje | **Triggeruje** |
| `+m` i `+n` | Nie triggeruje | Nie triggeruje |

Dodatkowe wymagania:
- Chanset `bitch` musi byc wlaczony (jest domyslnie)
- Opowana osoba nie moze juz miec statusu opa

**Przyklad:** Uzytkownik z flaga `+m` (ale bez `+n`) wykonuje `MODE #kanal +oo nick1 nick2`. Bot wykrywa naruszenie (masowe opowanie bez `+n`), wlacza op-lockdown i karze uzytkownika.

### 2. Kick bota z kanalu

Ktos bez uprawnien wykopuje bota z kanalu.

### 3. Nielegalne zaproszenie (invite)

Ktos proobuje ominac restrykcje dostepu do kanalu (np. `+i`).

### 4. Nielegalne zmiany trybow

Ktos bez uprawnien zmienia tryby kanalu (`+b`, `+e`, `+I`, `+l`, itp.).

## System idiots — wartosci

Chanset `idiots` kontroluje co sie dzieje z uzytkownikiem po naruszeniu:

| Wartosc | Dzialanie |
|---|---|
| 0 | Wylaczony — brak reakcji |
| 1 | Usuniecie flagi `+a` (autoop) |
| 2 | Degradacja flag (domyslne) |
| 3 | Kick lub wylaczenie konta (przy powaznych naruszeniach) |
| 4 | Wylaczenie konta na kanale (flaga `+d`) |
| 5 | Wylaczenie konta globalnie (flaga `+d` globalnie) |
| **6** | **Wlaczenie op-lockdown** (blokada autoop dla wszystkich ponizej `+n`) |

Ustawienie:

```
.chset #kanal idiots 6
```

## Efekt dzialania

Gdy op-lockdown jest aktywny, zmienia sie logika autoopu:

- **Lockdown OFF:** Kazdy uzytkownik z `+o` i `+a` dostaje automatycznie opa po wejsciu na kanal.
- **Lockdown ON:** Tylko uzytkownicy z flaga `+n` (owner) dostaja opa. Uzytkownicy z `+o`, `+m`, `+a` (ale bez `+n`) **nie dostaja opa**.

## Wazne uwagi

- Op-lockdown **nie wylacza sie automatycznie**. Po wlaczeniu (recznie lub przez idiots) trzeba go wylaczyc recznie.
- Lockdown dziala per-kanal — wlaczenie na `#kanal1` nie wplywa na `#kanal2`.
- Przy `idiots` = `6` lockdown jest dodatkowa reakcja obok standardowej kary (degradacja/wylaczenie uzytkownika).
- W panelu webowym aktywny lockdown jest widoczny jako czerwony pulsujacy banner z napisem "Op lockdown enabled".

## Typowe scenariusze uzycia

### Scenariusz 1: Prewencja

Ustawiasz `idiots 6` na waznym kanale. Gdy ktos naduzyl uprawnien (np. opowal osoby spoza userlisty), bot automatycznie:
1. Karze winowajce (degradacja/wylaczenie)
2. Wlacza op-lockdown — nikt ponizej `+n` nie dostaje juz opa
3. Czekasz az sytuacja sie uspokoi, potem wylaczasz lockdown recznie

### Scenariusz 2: Reczna blokada

Na kanale doszlo do naduzywania opow. Wlazczasz lockdown recznie:
```
.chset #kanal op-lockdown ON
```
Tylko ownerzy (`+n`) moga teraz dostac opa. Po sprawdzeniu sytuacji wylaczasz:
```
.chset #kanal op-lockdown OFF
```

### Scenariusz 3: Awaryjne wylaczenie przez IRC

Nie masz dostepu do partyline ani panelu. Wysylasz na kanale:
```
delock twojehaslo #kanal
```
Bot wylacza lockdown i potwierdza notice'm.
