# Phantom

```text
           __                __
    ____  / /_  ____ _____  / /_____  ____ ___
   / __ \/ __ \/ __ `/ __ \/ __/ __ \/ __ `__ \
  / /_/ / / / / /_/ / / / / /_/ /_/ / / / / / /
 / .___/_/ /_/\__,_/_/ /_/\__/\____/_/ /_/ /_/
/_/                                defence bot
```

[![License: GPL-2.0](https://img.shields.io/badge/license-GPL--2.0-blue.svg)](COPYRIGHT.GPL)
![C++](https://img.shields.io/badge/core-C%2B%2B-00599C.svg)
![React](https://img.shields.io/badge/panel-React%20%2B%20TypeScript-61DAFB.svg)
![Bun](https://img.shields.io/badge/proxy-Bun-black.svg)
![IRC](https://img.shields.io/badge/protocol-IRC-4B5563.svg)

**Phantom** is a public IRC defence bot with a browser control panel. It keeps
the battle-tested Psotnic botnet model, strips private deployment baggage, and
adds a modern WebAPI + React operator surface.

```text
run the hub        watch the botnet        act from the panel
    C++      ->      JSON/TCP WebAPI   ->      React + Bun
```

## Lineage Credits

Phantom is not a from-scratch IRC bot. It descends from **Psotnic** and
**gay-psotnic**, and the original authors stay visible here by design.

| Project | Original authors and credits |
|---------|------------------------------|
| Psotnic | pks (Grzegorz Rusin) `<grusin@gmail.com>`: original author, project leader |
| Psotnic | Esio `<esio@hoth.amu.edu.pl>`: development, bug reports |
| Psotnic | patrick `<patrick@psotnic.com>`: development, modules, psotnic.com website |
| gay-psotnic | patrick `<patrick@psotnic.com>`: gay-psotnic development |
| gay-psotnic | pks (Grzegorz Rusin) `<grusin@gmail.com>`: original Psotnic author |
| gay-psotnic | Esio `<esio@hoth.amu.edu.pl>`: Psotnic development |
| gay-psotnic | [C]167 (Stefan Valouch) `<stefanvalouch@googlemail.com>`: `make install` |

Additional Psotnic contributors: cgod, dArk, Darkman, Googie, matrix,
oroblram, Pirat, UukGoblin, wilk, and [C]167. The original credits also thank
the people from `#psotnic` on IRCnet, `psotnic.sf.net`, and `psotnic.com`.

gay-psotnic testing credits: anank, Aretino, matrix, and nerd.

## Phantom Authors

| Name | Credit |
|------|--------|
| Jerzy (kofany) Dąbrowski [`github.com/kofany`](https://github.com/kofany) | Phantom fork modifications, public cleanup, web panel |
| Dominik (yooz) Juźwikowski [`github.com/y-o-o-z`](https://github.com/y-o-o-z) | Phantom fork modifications, web panel |

## Why Phantom

| Need | What Phantom gives you |
|------|------------------------|
| IRC channel defence | hub/slave/leaf bot topology with module-based protection |
| Operator visibility | browser panel for bots, users, channels, bans, audit history, topology, and IRC server data |
| Old-school control | partyline access over IRC/DCC or the users listener |
| Automation surface | JSON/TCP WebAPI exposed to local tooling through a Bun proxy |
| Public release hygiene | neutral configs, cleaned private names, no bundled secrets or deployment state |

Core version: `0.1.1 (26-02-24) Phantom fork`.

## Fast Path

Three terminals, one hub, one panel.

**1. Build and install the hub**

```bash
./configure --with-webapi
make
make modules
make install
```

**2. Create and run the hub**

```bash
cd ~/phantom
./phantom -n
```

Add WebAPI to the hub config:

```text
listen 127.0.0.1 5555 webapi
```

Start it:

```bash
./phantom hub.cfg
```

**3. Start the panel**

```bash
cd webpanel
bun install
bun run proxy
bun run dev
```

Open `http://localhost:3000`.

Need the longer version:

- `HOWTO_EN.md` for the full English runbook.
- `HOWTO_PL.md` for the Polish runbook.

## System Shape

```text
IRC servers
    |
 leaf bots
    |
 slave bots
    |
 main hub  <---- partyline users
    |
 JSON/TCP WebAPI 127.0.0.1:5555
    |
 Bun WebSocket proxy :8080
    |
 React panel :3000
```

Keep raw `webapi` on `127.0.0.1` or a trusted private interface. Public access
belongs in front of the panel/proxy layer, with TLS and reverse proxy rules.

## Operator Surface

| Surface | Use it for |
|---------|------------|
| Partyline | direct command access: `.bots`, `.help`, `.set`, `.bc`, `.rehash` |
| Web panel | visual botnet state, channel/user operations, bans, health, audit history |
| WebAPI | local integrations and panel traffic over newline-delimited JSON |
| Modules | channel defence logic loaded as runtime `.so` modules |

Example WebAPI frame:

```text
{"type":"auth","data":{"handle":"alice","password":"..."}}\n
```

Protocol details live in `docs/WEBAPI_PROTOCOL.md`.

## Features

- Hub, slave, and leaf topology.
- Flag-based user permissions.
- Encrypted config and userlist files derived from per-build seeds.
- IPv4 and IPv6 support.
- Optional TLS through OpenSSL.
- Optional async DNS through ADNS or FireDNS.
- Runtime-loaded protection modules.
- React panel backed by a Bun WebSocket-to-TCP proxy.

## Modules

| Module | Purpose |
|--------|---------|
| `op` | automatic op for known users |
| `spam` | flood, repeat, and caps detection |
| `repeat` | repeated-message detection |
| `words` | banned-word filter |
| `topic` | topic persistence |
| `dnscbl` | DNS-based blocklist checks |
| `dccchat` | partyline helpers |
| `oidentd` | oidentd integration |
| `vctrl` | voice control |
| `date`, `uptime`, `peak`, `peak2` | informational commands |
| `control` | remote-control helpers used by other modules |

Build modules with:

```bash
make modules
```

## Repository Map

```text
phantom/
|-- *.cpp / *.h            bot core
|-- modules/               loadable modules
|-- cfg-examples/          neutral example configs
|-- docs/                  protocol docs, old wiki mirror, Polish manuals
|-- easy-rsa/              certificate helper files
|-- webpanel/              React + TypeScript web panel and Bun proxy
|-- AUTHORS                gay-psotnic authors and contributors
|-- AUTHORS-psotnic        original Psotnic authors and contributors
|-- HOWTO_EN.md            hub + panel runbook
|-- HOWTO_PL.md            hub + panel runbook in Polish
`-- README.md              this file
```

## Requirements

| Part | Requirements |
|------|--------------|
| Bot core | POSIX-like system, GCC-compatible compiler, GNU Make, Perl, pthreads |
| Optional bot support | OpenSSL, `libdl`, ADNS or FireDNS |
| Web panel | Bun 1.1+, running Phantom hub with `webapi` |
| Production hosting | Caddy, nginx, or another TLS reverse proxy |

## Build Options

| Flag | Purpose |
|------|---------|
| `--prefix PATH` | installation directory, default `~/phantom` |
| `--with-webapi` | enable WebAPI for the panel |
| `--with-debug` | debug build |
| `--with-antiptrace` | compile anti-debugger checks |
| `--no-irc-backtrace` | disable IRC-side crash backtraces |
| `--disable-ssl` | build without OpenSSL |
| `--disable-adns` | use blocking DNS |
| `--disable-modules` | build without dynamic modules |
| `--with-firedns` | use FireDNS |

`./configure` generates `seed.h`. Back it up with deployment secrets and do not
commit it. Configs and userlists encrypted with one seed set cannot be decrypted
with another seed set.

## Panel Runtime

Development:

```bash
cd webpanel
bun install
bun run proxy
bun run dev
```

Production:

```bash
cd webpanel
bun run build
HUB_HOST=127.0.0.1 HUB_PORT=5555 WS_PORT=8080 bun run proxy
```

Proxy environment:

| Variable | Default | Purpose |
|----------|---------|---------|
| `WS_PORT` | `8080` | WebSocket listen port |
| `HUB_HOST` | `127.0.0.1` | hub host |
| `HUB_PORT` | `5555` | hub `webapi` port |
| `HUB_SSL` | `false` | wrap the hub TCP connection in TLS |
| `IRCNET_API_URL` | upstream default | IRC server-list source override |

The provided `webpanel/Caddyfile` can serve the static build and reverse-proxy
`/ws` to the Bun proxy.

## Development Checks

```bash
cd webpanel
bun run build
bun run test

cd ..
./configure --with-webapi
make
make modules
```

Engineering notes:

- Bot-core changes affect network compatibility, config handling, and module
  ABI.
- Use `ircd_strcmp` / `ircd_strncmp` for IRC-style case folding inside bot
  code.
- Wrap debug-only code in `#ifdef HAVE_DEBUG` or `DEBUG(x)`.
- Keep English and Polish i18n files in `webpanel/src/i18n/` symmetric.

## Documentation

| File | Purpose |
|------|---------|
| `README_PL.md` | Polish project overview |
| `HOWTO_EN.md` | hub + panel setup |
| `HOWTO_PL.md` | hub + panel setup in Polish |
| `docs/WEBAPI_PROTOCOL.md` | WebAPI protocol reference |
| `docs/SZYBKI_START_PL.md` | older Polish quick start |
| `docs/DOKUMENTACJA_PL.md` | older Polish manual |
| `docs/KOMENDY_PARTYLINE_PL.md` | Polish partyline command reference |
| `docs/ARCHITEKTURA_TECHNICZNA_PL.md` | Polish architecture notes |
| `docs/wiki/` | historical Psotnic wiki mirror |
| `INSTALL` | legacy install walkthrough |

## License

Phantom inherits the Psotnic/gay-psotnic licensing lineage and is distributed
under GPL-2.0 terms. Many original Psotnic/gay-psotnic source files carry
GPL-2.0-or-later notices, while bundled components such as FireDNS/FireString
carry GPL-2.0-only notices; treat the combined public repository as GPL-2.0.
The full license text is in `COPYRIGHT.GPL`.

## Responsible Use

This software is provided for legitimate IRC channel operation, administration,
research, and development. You are responsible for complying with the rules of
the networks you connect to and with applicable law.
