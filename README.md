# Phantom

```text
           __                __
    ____  / /_  ____ _____  / /_____  ____ ___
   / __ \/ __ \/ __ `/ __ \/ __/ __ \/ __ `__ \
  / /_/ / / / / /_/ / / / / /_/ /_/ / / / / / /
 / .___/_/ /_/\__,_/_/ /_/\__/\____/_/ /_/ /_/
/_/                                defence bot
```

**Phantom** is a public IRC defence bot and web control panel derived from
the historical **Psotnic** project and the later **gay-psotnic** fork.

## Original Authors

Phantom is not a from-scratch IRC bot. The original authors and contributors
of Psotnic and gay-psotnic are part of Phantom's public credit chain and must
stay visible in this repository.

### Psotnic

From `AUTHORS-psotnic`:

| Name | Credit |
|------|--------|
| pks (Grzegorz Rusin) `<grusin@gmail.com>` | original author, project leader |
| Esio `<esio@hoth.amu.edu.pl>` | development, bug reports |
| patrick `<patrick@psotnic.com>` | development, modules, psotnic.com website |

Additional Psotnic contributors:

| Name | Credit |
|------|--------|
| cgod `<c@sii.ath.cx>` | modules: date, peak2, words |
| dArk | big endian support |
| Darkman `<darkman82@interfree.it>` | EaZy psotnic, wiki work |
| Googie (Pawel Salawa) `<boogie@myslenice.one.pl>` | `.bottree`, Tcl hints |
| matrix `<admin@areaunix.org>` | modules: google, peak |
| oroblram `<stu@wilf.co.uk>` | modules: log, subop, and more |
| Pirat | bug reports |
| UukGoblin | x86 fixes |
| wilk `<wilq.pl@vp.pl>` | patches, bug reports, feature requests |
| [C]167 (Stefan Valouch) `<stefanvalouch@googlemail.com>` | patches |

The original Psotnic credits also thank the people from `#psotnic` on IRCnet,
`psotnic.sf.net`, and `psotnic.com`.

### gay-psotnic

From `AUTHORS`:

| Name | Credit |
|------|--------|
| patrick `<patrick@psotnic.com>` | gay-psotnic development |
| pks (Grzegorz Rusin) `<grusin@gmail.com>` | original Psotnic author |
| Esio `<esio@hoth.amu.edu.pl>` | Psotnic development |
| [C]167 (Stefan Valouch) `<stefanvalouch@googlemail.com>` | `make install` |

Testing credits:

| Name | Credit |
|------|--------|
| anank `<anank@blackcode.it>` | testing |
| Aretino `<aretino@irc.it>` | testing |
| matrix `<admin@areaunix.org>` | testing |
| nerd | testing |

### Phantom Modifications

| Name | Credit |
|------|--------|
| Jerzy (kofany) Dąbrowski [`github.com/kofany`](https://github.com/kofany) | Phantom fork modifications, public cleanup, web panel |
| Dominik (yooz) Juźwikowski [`github.com/y-o-o-z`](https://github.com/y-o-o-z) | Phantom fork modifications, web panel |

## At A Glance

| Area | Details |
|------|---------|
| Core | C++ IRC bot network with hub, slave, and leaf roles |
| Control | Partyline over IRC/DCC/users listener |
| Panel | React + TypeScript SPA with a Bun WebSocket-to-TCP proxy |
| WebAPI | Newline-delimited JSON over TCP, intended for localhost/private use |
| Modules | Runtime-loaded `.so` modules |
| License | GPL-2.0 for the combined repository |

Core version: `0.1.1 (26-02-24) Phantom fork`.

## Quick Start

Build the bot core:

```bash
./configure --with-webapi
make
make modules
make install
```

Create a hub config:

```bash
cd ~/phantom
./phantom -n
```

Add a local WebAPI listener to the hub config:

```text
listen 127.0.0.1 5555 webapi
```

Run the hub:

```bash
./phantom hub.cfg
```

Run the web panel in development mode:

```bash
cd webpanel
bun install
bun run proxy
bun run dev
```

Open `http://localhost:3000`.

Detailed runbooks:

- `HOWTO_EN.md` - hub + panel setup in English.
- `HOWTO_PL.md` - hub + panel setup in Polish.

## Architecture

```text
IRC servers <-> leaf bots <-> slave bots <-> main hub
                                               ^
                                               |
                                  JSON/TCP WebAPI listener
                                               |
                                      Bun WebSocket proxy
                                               |
                                          Web panel
```

Keep the raw `webapi` listener bound to `127.0.0.1` or a trusted private
interface. Put public TLS, authentication boundaries, and reverse proxy rules in
front of the panel/proxy layer.

## Features

- Hub, slave, and leaf bot topology.
- Partyline access over IRC/DCC or a users listener.
- Flag-based user permissions.
- Encrypted config and userlist files derived from per-build seeds.
- IPv4 and IPv6 support.
- Optional TLS through OpenSSL.
- Optional async DNS through ADNS or FireDNS.
- JSON/TCP WebAPI for integrations and the web panel.
- React web panel for bots, users, channels, bans, topology, audit history,
  IRC server data, and common administrative actions.

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

Bot core:

- Linux or another POSIX-like system.
- GCC or another compiler compatible with this codebase.
- GNU Make.
- Perl for `./configure`.
- pthreads.

Optional bot dependencies:

- OpenSSL for TLS.
- `libdl` for dynamic modules.
- ADNS or FireDNS for asynchronous DNS.

Web panel:

- Bun 1.1 or newer.
- A running Phantom hub with a `webapi` listener.
- Optional Caddy or another reverse proxy for TLS and static hosting.

## Build Options

Useful `./configure` flags:

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

## Modules

Modules are built as shared objects under `modules/` and loaded by path from
the bot config. Module hashes are pinned, so a changed `.so` must be accepted by
updating the config.

Common bundled modules:

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

Rebuild modules after source changes:

```bash
make modules
```

## Web Panel

Development:

```bash
cd webpanel
bun install
bun run proxy
bun run dev
```

Production build:

```bash
cd webpanel
bun run build
bun run proxy
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

## WebAPI

WebAPI is newline-delimited JSON over TCP:

```text
{"type":"auth","data":{"handle":"alice","password":"..."}}\n
```

It provides session authentication, rate limiting, bot/channel/user operations,
audit data, and real-time event broadcasts for the panel.

Protocol reference: `docs/WEBAPI_PROTOCOL.md`.

## Development

High-signal checks:

```bash
cd webpanel
bun run build
bun run test

cd ..
./configure --with-webapi
make
make modules
```

Notes:

- Bot-core changes affect network compatibility, config handling, and module
  ABI. Keep them small and test them with real config examples.
- Use `ircd_strcmp` / `ircd_strncmp` for IRC-style case folding inside bot
  code.
- Wrap debug-only code in `#ifdef HAVE_DEBUG` or `DEBUG(x)`.
- Keep English and Polish i18n files in `webpanel/src/i18n/` symmetric.

## Documentation

- `README_PL.md` - Polish project overview.
- `HOWTO_EN.md` - hub + panel setup.
- `HOWTO_PL.md` - hub + panel setup in Polish.
- `docs/WEBAPI_PROTOCOL.md` - WebAPI protocol reference.
- `docs/SZYBKI_START_PL.md` - older Polish quick start.
- `docs/DOKUMENTACJA_PL.md` - older Polish manual.
- `docs/KOMENDY_PARTYLINE_PL.md` - Polish partyline command reference.
- `docs/ARCHITEKTURA_TECHNICZNA_PL.md` - Polish architecture notes.
- `docs/wiki/` - historical Psotnic wiki mirror.
- `INSTALL` - legacy install walkthrough.

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
