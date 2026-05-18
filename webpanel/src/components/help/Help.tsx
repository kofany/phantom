import { useState } from 'react'
import { Icon, IconName } from '../common'

type Section = {
  id: string
  icon: IconName
  title: string
  body: React.ReactNode
}

const SECTIONS: Section[] = [
  {
    id: 'about',
    icon: 'book',
    title: 'O panelu — czym jest i jak działa',
    body: (
      <>
        <p>
          Panel <strong>Phantom</strong> to webowy interfejs do zarządzania hubem i całą
          flotą botów IRC. Wszystko, co tu klikasz, pod spodem trafia do tych samych komend
          partyline, które znasz z terminala — tylko że w UI nie trzeba pamiętać składni.
        </p>
        <p>
          Architektura jest prosta: przeglądarka → WebSocket → proxy Bun → WebAPI huba. Panel
          nie trzyma własnego stanu — pokazuje to, co widzi hub w danym momencie. Eventy
          (ban, kick, zmiana konfigu, dołączenie bota) lecą na żywo do wszystkich
          zalogowanych ownerów.
        </p>
        <p className="help-callout">
          <strong>Zasada:</strong> źródłem prawdy jest zawsze hub (<code>bot.cfg</code> + userlist).
          Panel tylko odzwierciedla stan. Jeśli coś wygląda dziwnie w UI — sprawdź partyline.
        </p>
        <p>
          Poniżej opis każdej zakładki — co widzisz po kliknięciu, jakie przyciski są do
          dyspozycji, co się dzieje w tle.
        </p>
      </>
    ),
  },
  {
    id: 'overview',
    icon: 'dashboard',
    title: 'Panel — ekran startowy',
    body: (
      <>
        <p>
          Pierwsza zakładka (<em>Panel</em>). Daje skrót stanu całego botnetu bez klikania w
          poszczególne widoki.
        </p>
        <p><strong>Co zobaczysz po otwarciu:</strong></p>
        <ul>
          <li><strong>Cztery kafelki KPI na górze</strong> — Boty online, Kanały, Użytkownicy, Eventy&nbsp;/24h. Klikalne — przenoszą do pełnego widoku.</li>
          <li><strong>Ostatnia aktywność</strong> — live feed z huba (dołączenia, quity, zmiany modów, bany) aktualizowany w czasie rzeczywistym.</li>
          <li><strong>Aktywne kanały</strong> — top 5 po liczbie userów. Klik w wiersz → szczegóły kanału.</li>
          <li><strong>Zdrowie botnetu</strong> — kompakt z widoku <em>Stan</em>: ilu botów kuleje, gdzie jest lag.</li>
        </ul>
        <p><strong>Przyciski akcji</strong> (widoczne dla ownerów): szybkie „Dodaj kanał", „Dodaj usera", „Dodaj bota" — otwierają odpowiednie modale bez konieczności przechodzenia do innej zakładki.</p>
      </>
    ),
  },
  {
    id: 'channels',
    icon: 'hash',
    title: 'Kanały — zarządzanie #-ami',
    body: (
      <>
        <p>
          Lista wszystkich kanałów obsługiwanych przez botnet. Każdy wiersz pokazuje nazwę,
          liczbę userów, status operatorski, flagi kanału.
        </p>
        <p><strong>Przyciski na górze listy:</strong></p>
        <ul>
          <li><strong>„+"</strong> — otwiera modal <em>Dodaj kanał</em>: nazwa, opcjonalnie klucz, chanset startowy.</li>
          <li><strong>Wyszukiwarka</strong> — filtruje listę po nazwie (działa też globalny search w nagłówku).</li>
        </ul>
        <p><strong>Kliknięcie wiersza</strong> otwiera <em>szczegóły kanału</em> z zakładkami:</p>
        <ul>
          <li><strong>Użytkownicy</strong> — kto aktualnie siedzi na kanale: nick, host, status op/voice, bot który go widzi. Możesz kliknąć nick i przejść do usera.</li>
          <li><strong>Chanset</strong> — wszystkie zmienne kanałowe (autoop, autovoice, bantime, enforcebans, mdop, mode, ...) — edytowalne inline. Zmiana od razu leci do huba.</li>
          <li><strong>Protlisty</strong> — bany, sticky, exempty, invite, reopy przypięte do tego kanału. Każda z przyciskiem „+" (dodaj) i „×" przy wpisie (usuń).</li>
          <li><strong>Akcje operatora</strong> — panel przycisków: <em>opme</em>, <em>deopme</em>, <em>cycle</em>, <em>reset</em>, <em>lock</em>, <em>unlock</em>, <em>mass-kick</em> (tiery 1/2/3 z opcjonalnym lockiem).</li>
          <li><strong>Akcje per bot</strong> — to samo, ale wybierasz konkretnego bota który ma wykonać komendę (przydatne gdy jeden leaf ma wpadkę).</li>
        </ul>
      </>
    ),
  },
  {
    id: 'users',
    icon: 'users',
    title: 'Użytkownicy — userlist huba',
    body: (
      <>
        <p>
          Wszyscy, którzy mają wpis w userliście bota (<code>mIRCnet.ul</code>). Lista pokazuje
          handle, status online (zielona/szara kropka), skrócony zestaw flag.
        </p>
        <p><strong>Akcje z listy:</strong></p>
        <ul>
          <li><strong>„+"</strong> — modal <em>Dodaj usera</em>: handle, hasło, opcjonalna pierwsza maska hosta, flagi startowe.</li>
          <li><strong>Wyszukiwarka</strong> — po handlu.</li>
        </ul>
        <p><strong>Kliknięcie usera</strong> otwiera szczegóły z zakładkami:</p>
        <ul>
          <li><strong>Flagi</strong> — dwie sekcje: globalne i per kanał. Każdą edytujesz przyciskiem „Edytuj" — wpisujesz string flag (np. <code>nmo</code>) i zapisujesz. Dla flag per kanał możesz dodać nowy kanał z selecta.</li>
          <li><strong>Hosts</strong> — lista masek (<code>*!*@foo.bar</code>) po których bot rozpoznaje usera. Dodaj / usuń wpisami.</li>
          <li><strong>Hasło</strong> — zmiana hasła (do partyline i panelu). Wymaga podania dwa razy.</li>
          <li><strong>Info</strong> — dowolne pary klucz/wartość (np. email, notatka). Dodawalne i usuwalne.</li>
          <li><strong>Notatki</strong> / <strong>Offences</strong> — dodatkowe zakładki z notatnikiem i historią przewinień (jeśli bot to zbiera).</li>
          <li><strong>Historia</strong> — ostatnie zmiany na tym userze z audit loga.</li>
        </ul>
        <p>Na dole jest przycisk <em>Usuń usera</em> — z potwierdzeniem, nieodwracalne.</p>
      </>
    ),
  },
  {
    id: 'bots',
    icon: 'bot',
    title: 'Boty — flota leafów',
    body: (
      <>
        <p>
          Lista wszystkich botów zdefiniowanych w userliście huba — online i offline.
          Każdy wiersz pokazuje: status (zielona/szara kropka), handle, nick na IRC, serwer
          do którego jest przyklejony, uptime.
        </p>
        <p><strong>Akcje z listy:</strong></p>
        <ul>
          <li><strong>„+"</strong> — modal <em>Dodaj bota</em>: handle, adres (host:port), ewentualne dodatkowe uplinki.</li>
          <li><strong>Boot</strong> (przycisk per wiersz) — rozłącza bota z partyline.</li>
        </ul>
        <p><strong>Kliknięcie bota</strong> otwiera szczegóły:</p>
        <ul>
          <li><strong>Info</strong> — wersja, uptime, lag, serwer, liczba kanałów, RAM/CPU jeśli bot je raportuje.</li>
          <li><strong>Konsola per-bot</strong> — wysyłasz komendę do konkretnie tego bota (<code>.jump</code>, <code>.die</code>, <code>.restart</code>, <code>.dump</code>, cokolwiek). Output wraca tutaj.</li>
          <li><strong>Historia</strong> — ostatnie zmiany dotyczące tego bota z audit loga.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'bans',
    icon: 'shield',
    title: 'Bany — wszystkie protlisty w jednym miejscu',
    body: (
      <>
        <p>
          Centralny widok wszystkich list ochronnych. Protlist (Psotnic) to mechanizm
          trzymania masek z automatycznym efektem (ban / stick / exempt / invite / reop),
          globalnie lub per kanał.
        </p>
        <p><strong>Układ widoku:</strong></p>
        <ul>
          <li><strong>Tabsy u góry</strong> — przełączają między typami: <em>Bany</em>, <em>Sticky</em>, <em>Exempty</em>, <em>Invite</em>, <em>Reopy</em>.</li>
          <li><strong>Select kanału</strong> (lub „Global") — filtruje, czyje wpisy oglądasz.</li>
          <li><strong>Tabela</strong> — maska, kanał/global, kto założył, kiedy, powód, expiry. Przy każdym wpisie „×" do usunięcia.</li>
          <li><strong>Przycisk „+"</strong> — modal <em>Dodaj wpis</em>: maska, kanał (lub global), typ, powód, expiry (opcjonalnie).</li>
        </ul>
        <p>
          <strong>Ban vs stick:</strong> ban można zdjąć ręcznie, stick bot nałoży z powrotem
          nawet jak ktoś go usunie. Stick oznaczany <code>[*]</code> w wynikach partyline.
        </p>
      </>
    ),
  },
  {
    id: 'health',
    icon: 'check',
    title: 'Stan — zdrowie botnetu na jednym ekranie',
    body: (
      <>
        <p>
          Dashboard „czy wszystko gra". Każda sekcja ma swój status (OK / warning / error) i
          listę detali. Wszystkie wiersze są klikalne — przeniosą Cię do miejsca, gdzie
          problem się dzieje.
        </p>
        <p><strong>Sekcje:</strong></p>
        <ul>
          <li><strong>Połączenie</strong> — stan WebSocketa do proxy i proxy do huba. Gdy miga — problem z infrą.</li>
          <li><strong>Boty</strong> — ilu offline, ilu z dużym lagiem, ilu desynchro (różnica stanu vs hub).</li>
          <li><strong>Kanały</strong> — na których nie ma opa, na których jest tylko jeden bot, gdzie bot nie ma synca.</li>
          <li><strong>Partyline</strong> — kto aktualnie wisi podpięty do panelu lub partyline.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'topology',
    icon: 'globe',
    title: 'Topologia — mapa połączeń',
    body: (
      <>
        <p>
          Graficzny widok botnetu: hub na górze, pod nim leafy/slavy, a niżej serwery IRC
          do których są podpięte.
        </p>
        <p><strong>Co widzisz:</strong></p>
        <ul>
          <li><strong>Karty per serwer IRC</strong> — każda wypisuje boty, które aktualnie siedzą na tym serwerze. Od razu widać kolizje (dwa boty na tym samym serwerze).</li>
          <li><strong>Kolor karty</strong> — zielony: wszystko OK; pomarańcz: częściowo (np. jeden z botów kuleje); czerwony: cały serwer padł / wszystkie boty offline.</li>
          <li><strong>Klik w bota</strong> — skok do szczegółów bota.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'irc',
    icon: 'server',
    title: 'Serwery IRC — lista sieci i nasze pokrycie',
    body: (
      <>
        <p>
          Tabela wszystkich serwerów IRCNet-u (scrapowana z ircnet.info), z dodatkową
          kolumną „nasze boty" — które leafy aktualnie są na którym serwerze.
        </p>
        <p><strong>Co pokazuje:</strong></p>
        <ul>
          <li><strong>Nazwa serwera + host</strong> — nazwa węzła i adres.</li>
          <li><strong>Users / Clients</strong> — live user counts, jeśli proxy ma dostęp do źródła.</li>
          <li><strong>Nasze boty</strong> — handle i nick każdego leafa na tym serwerze.</li>
          <li><strong>Add bot to server</strong> — skrót otwierający modal <em>Dodaj bota</em> z pre-wypełnionym adresem.</li>
        </ul>
        <p>
          Jeśli tabela jest pusta lub niekompletna — źródło (ircnet.info) może być
          chwilowo niedostępne; spróbuj <em>Odśwież</em>.
        </p>
      </>
    ),
  },
  {
    id: 'idiots',
    icon: 'alert-triangle',
    title: 'Idiots — czarna lista masek',
    body: (
      <>
        <p>
          Specjalna lista huba: maski/handle, które zasłużyły na permanentny wpis — klonery,
          flooderzy i inne nadużycia. Idiot-list działa globalnie i zwalnia Cię z konieczności
          trzymania tych samych masek w banach każdego kanału.
        </p>
        <p><strong>Co pokazuje widok:</strong></p>
        <ul>
          <li><strong>Tabela wpisów</strong> — maska, powód, kto dodał, kiedy.</li>
          <li><strong>„+"</strong> — dodaj nowy wpis (maska + powód).</li>
          <li><strong>„×" przy wpisie</strong> — usunięcie (z potwierdzeniem).</li>
          <li><strong>Wyszukiwarka</strong> — filtrowanie po masce lub autorze.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'audit',
    icon: 'clock',
    title: 'Audit log — co się dzieje i kto to zrobił',
    body: (
      <>
        <p>
          Widok zbiera zdarzenia z dwóch źródeł:
        </p>
        <ul>
          <li><strong>Ta sesja</strong> — co <em>Ty</em> robiłeś w panelu od zalogowania.</li>
          <li><strong>Broadcast</strong> — zdarzenia przychodzące z huba (inni ownerzy w panelu lub partyline).</li>
        </ul>
        <p><strong>Filtry u góry:</strong></p>
        <ul>
          <li><strong>Wyszukiwarka</strong> — full-text po celu, aktorze, detalu.</li>
          <li><strong>Select aktora</strong> — pokaż tylko zdarzenia jednego ownera.</li>
          <li><strong>Select akcji</strong> — pokaż tylko jeden typ (add_user, del_ban, chset...).</li>
          <li><strong>Źródło</strong> — Ta sesja / Broadcast / wszystko.</li>
        </ul>
        <p><strong>Eksport i czyszczenie:</strong></p>
        <ul>
          <li><strong>JSON / CSV</strong> — pobierasz log do pliku (np. po incydencie).</li>
          <li><strong>Wyczyść log</strong> — czyści <em>tylko lokalny stan Twojej przeglądarki</em>. Inni ownerzy mają swoje logi nietknięte.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'actions',
    icon: 'zap',
    title: 'Akcje w sidebarze — Quick ban, Mass ban, Weryfikacja',
    body: (
      <>
        <p>
          Sekcja <em>Akcje</em> w sidebarze (pod nawigacją) zbiera narzędzia, które chcesz mieć
          pod ręką z każdego widoku. Dostępne dla ownerów.
        </p>
        <ul>
          <li>
            <strong>Szybki ban</strong> — modal z jednym polem na maskę + wyborem kanału (lub „global")
            + powód + expiry. Wybierasz ban albo stick. Dla pojedynczych wpisów — najszybsza ścieżka.
          </li>
          <li>
            <strong>Mass ban</strong> — modal na wiele masek naraz (paste listy, każda linia = jeden wpis).
            Ustawiasz kanał, powód, expiry — lecą wszystkie naraz.
          </li>
          <li>
            <strong>Weryfikacja</strong> — modal sprawdzający, kto faktycznie siedzi pod daną maską na
            wskazanym kanale. Wykryje cloaka, dwóch userów pod tą samą maską, maskę która nie trafia w nikogo.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'console',
    icon: 'terminal',
    title: 'Mini-konsola — partyline przypięta do ekranu',
    body: (
      <>
        <p>
          Dolna belka panelu: live partyline. Piszesz komendy jak w terminalu
          (<code>.set</code>, <code>.bots</code>, <code>.chanset</code>, <code>.+user</code>...), a wynik
          wraca od razu.
        </p>
        <p><strong>Co masz w konsoli:</strong></p>
        <ul>
          <li><strong>Input komend</strong> — enter wysyła.</li>
          <li><strong>Filtr typu</strong> — chat / event / error, żeby nie gubić się w szumie.</li>
          <li><strong>Auto-scroll</strong> — można wyłączyć gdy czytasz starsze linie.</li>
          <li><strong>Klik w linię</strong> — kopiuje do schowka.</li>
        </ul>
        <p>
          Jeśli wolisz większą konsolę, otwórz ją z palety poleceń albo użyj konsoli
          per-bot w szczegółach konkretnego bota.
        </p>
      </>
    ),
  },
  {
    id: 'palette',
    icon: 'command',
    title: 'Paleta poleceń i skróty klawiszowe',
    body: (
      <>
        <p>
          Panel jest zrobiony pod klawiaturę. Większość rzeczy zrobisz bez dotykania myszy.
        </p>
        <p><strong>Najważniejsze skróty:</strong></p>
        <ul>
          <li><kbd>Ctrl</kbd>&nbsp;+&nbsp;<kbd>K</kbd> — <strong>paleta poleceń</strong>: jeden skrót i szukasz kanału, usera, bota, akcji. Enter wykonuje.</li>
          <li><kbd>/</kbd> — skacze do pola wyszukiwania w nagłówku.</li>
          <li><kbd>?</kbd> — ekran z pełną listą skrótów.</li>
          <li><kbd>g</kbd>&nbsp;<kbd>h</kbd> — Panel (Home).</li>
          <li><kbd>g</kbd>&nbsp;<kbd>c</kbd> — Kanały.</li>
          <li><kbd>g</kbd>&nbsp;<kbd>u</kbd> — Użytkownicy.</li>
          <li><kbd>g</kbd>&nbsp;<kbd>b</kbd> — Boty.</li>
          <li><kbd>g</kbd>&nbsp;<kbd>t</kbd> — Topologia.</li>
          <li><kbd>g</kbd>&nbsp;<kbd>a</kbd> — Audit log.</li>
          <li><kbd>g</kbd>&nbsp;<kbd>i</kbd> — Serwery IRC.</li>
          <li><kbd>g</kbd>&nbsp;<kbd>k</kbd> — Stan (health).</li>
          <li><kbd>Ctrl</kbd>&nbsp;+&nbsp;<kbd>B</kbd> — Szybki ban (dla uprawnionych).</li>
        </ul>
      </>
    ),
  },
  {
    id: 'sidebar',
    icon: 'menu',
    title: 'Sidebar — przypięte i ostatnie',
    body: (
      <>
        <p>
          Lewa kolumna poza samą nawigacją pokazuje też:
        </p>
        <ul>
          <li><strong>Przypięte</strong> — Twoje ulubione kanały / userzy / boty. Przypinasz przyciskiem „pin" w widoku szczegółów. Klik w przypięty wpis → skok bezpośrednio do niego.</li>
          <li><strong>Ostatnie</strong> — lista 5-10 ostatnio odwiedzonych obiektów (nie-przypiętych). Wygodne, żeby wrócić do kanału z którego właśnie wyszedłeś.</li>
          <li><strong>Sekcje można zwijać</strong> — klik w nazwę sekcji zwija/rozwija, stan zapamiętywany między odświeżeniami.</li>
          <li><strong>Tryb „collapsed"</strong> — ikona na belce górnej — sidebar zwija się do samych ikon (więcej miejsca na treść).</li>
        </ul>
      </>
    ),
  },
  {
    id: 'header',
    icon: 'wifi',
    title: 'Belka górna — presence, język, logout',
    body: (
      <>
        <p>W nagłówku znajdziesz:</p>
        <ul>
          <li><strong>Pasek obecności</strong> — kto jeszcze siedzi na partyline lub w panelu. Zielone kropki = online.</li>
          <li><strong>Wyszukiwarka globalna</strong> — szuka równolegle w kanałach, userach, botach.</li>
          <li><strong>Status WS</strong> — LIVE / ŁĄCZENIE / OFFLINE. Gdy panel traci połączenie, belka zmienia kolor i pojawia się pasek „reconnecting".</li>
          <li><strong>Przełącznik języka</strong> — PL / EN (niektóre widoki są tylko w PL, panel to narzędzie wewnętrzne).</li>
          <li><strong>Twój handle + wyloguj</strong> — po prawej.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'session-changes',
    icon: 'pencil',
    title: 'Moje edycje w sesji',
    body: (
      <>
        <p>
          Mała belka, która pojawia się gdy edytujesz coś w panelu — pokazuje listę zmian,
          które wykonałeś w bieżącej sesji (od ostatniego odświeżenia karty).
        </p>
        <p><strong>Po co to:</strong></p>
        <ul>
          <li>Widzisz „co ja tu dzisiaj porobiłem" bez wchodzenia w audit log.</li>
          <li>Każda zmiana ma „przed → po" — łatwo zorientować się, co dokładnie zmieniłeś.</li>
        </ul>
        <p>
          Lista znika przy odświeżeniu karty. Do trwałej historii służy <em>Audit log</em> —
          tam zdarzenia są zapisane na stałe i widoczne dla wszystkich ownerów.
        </p>
      </>
    ),
  },
  {
    id: 'credits',
    icon: 'help-circle',
    title: 'O projekcie i autorach',
    body: (
      <>
        <p>
          <strong>Phantom</strong> to fork klasycznego Psotnica rozwijany z myślą o małych,
          zgranych botnetach IRC, gdzie liczy się precyzja, widoczność stanu i szybkość
          reakcji. Hub trzyma całą sieć botów w ryzach, a ten panel daje Ci nad nim pełną
          kontrolę z poziomu przeglądarki — bez łażenia po partyline, bez zgadywania stanu,
          bez pytań „a kto teraz rządzi na kanale".
        </p>
        <p>
          Pod maską masz to samo, co w klasyku: userlist z flagami, protlisty, chanset,
          moduły, partyline — tylko ubrane w
          interfejs, który nie krzyczy i nie przeszkadza.
        </p>
        <h4>Autorzy</h4>
        <p>
          Phantom dziedziczy rdzeń Psotnic i dodaje WebAPI, proxy oraz panel React.
          Szczegóły autorów i licencji są w dokumentacji projektu.
        </p>
        <h4>Dla ownerów</h4>
        <p>
          Pamiętaj — panel jest tylko oknem. Źródłem prawdy pozostaje hub i jego userlist.
          Jeśli coś wygląda dziwnie w UI, sprawdź partyline. Jeśli partyline mówi co innego
          niż panel — zgłoś błąd.
        </p>
        <p className="help-signoff">
          <em>— Phantom</em>
        </p>
      </>
    ),
  },
]

export function Help() {
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const toggle = (id: string) => setOpen(s => ({ ...s, [id]: !s[id] }))
  const expandAll = () => {
    const next: Record<string, boolean> = {}
    for (const s of SECTIONS) next[s.id] = true
    setOpen(next)
  }
  const collapseAll = () => setOpen({})

  return (
    <div className="view-container help-view">
      <div className="view-header">
        <div>
          <h2>
            <Icon name="help-circle" size={22} />
            &nbsp;Pomoc — przewodnik po panelu
          </h2>
          <span className="view-subtitle">
            Opis każdej zakładki i co się dzieje po kliknięciu. Rozwiń sekcję, która Cię interesuje.
          </span>
        </div>
        <div className="view-tools">
          <button className="btn btn-ghost btn-sm" onClick={expandAll}>
            <Icon name="chevron-down" size={13} />
            Rozwiń wszystko
          </button>
          <button className="btn btn-ghost btn-sm" onClick={collapseAll}>
            <Icon name="chevron-right" size={13} />
            Zwiń wszystko
          </button>
        </div>
      </div>

      <div className="help-intro">
        <p>
          Witaj w panelu <strong>Phantom</strong>. Każda sekcja poniżej opisuje jeden widok
          panelu — co zobaczysz po kliknięciu, jakie są przyciski, co otwierają modale.
          Sekcje są domyślnie zwinięte; rozwijaj tylko to, co Cię aktualnie interesuje.
        </p>
      </div>

      <div className="help-accordion">
        {SECTIONS.map(s => {
          const isOpen = open[s.id] === true
          return (
            <section
              key={s.id}
              className={`help-section${isOpen ? ' open' : ''}`}
            >
              <button
                type="button"
                className="help-section-head"
                onClick={() => toggle(s.id)}
                aria-expanded={isOpen}
              >
                <span className="help-section-icon">
                  <Icon name={s.icon} size={17} />
                </span>
                <span className="help-section-title">{s.title}</span>
                <span className="help-section-chev">
                  <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={15} />
                </span>
              </button>
              {isOpen && (
                <div className="help-section-body">
                  {s.body}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
