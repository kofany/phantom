# Phantom

```text
           __                __                
    ____  / /_  ____ _____  / /_____  ____ ___ 
   / __ \/ __ \/ __ `/ __ \/ __/ __ \/ __ `__ \
  / /_/ / / / / /_/ / / / / /_/ /_/ / / / / / /
 / .___/_/ /_/\__,_/_/ /_/\__/\____/_/ /_/ /_/ 
/_/                                defence bot
```

## Lineage And Original Authors

**Phantom is not a from-scratch IRC bot.** It descends directly from the
historical **Psotnic** project and the later **gay-psotnic** fork. The original
authors and contributors of those projects are part of Phantom's public credit
chain and must stay visible in this repository.

### Psotnic Authors

From `AUTHORS-psotnic`:

| Name | Credit |
|------|--------|
| pks (Grzegorz Rusin) `<grusin@gmail.com>` | original author, project leader |
| Esio `<esio@hoth.amu.edu.pl>` | development, bug reports |
| patrick `<patrick@psotnic.com>` | development, modules, psotnic.com website |

Psotnic contributors:

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

### gay-psotnic Authors

From `AUTHORS`:

| Name | Credit |
|------|--------|
| patrick `<patrick@psotnic.com>` | gay-psotnic development |
| pks (Grzegorz Rusin) `<grusin@gmail.com>` | original Psotnic author |
| Esio `<esio@hoth.amu.edu.pl>` | Psotnic development |
| [C]167 (Stefan Valouch) `<stefanvalouch@googlemail.com>` | `make install` |

gay-psotnic testing credits:

| Name | Credit |
|------|--------|
| anank `<anank@blackcode.it>` | testing |
| Aretino `<aretino@irc.it>` | testing |
| matrix `<admin@areaunix.org>` | testing |
| nerd | testing |

Phantom keeps these credits at the top intentionally. Any public fork,
redistribution, or packaged build should preserve this section.

### Phantom Modification Authors

| Name | Credit |
|------|--------|
| Jerzy (kofany) Dąbrowski [`github.com/kofany`](https://github.com/kofany) | Phantom fork modifications, public cleanup, web panel |
| Dominik (yooz) Juźwikowski [`github.com/y-o-o-z`](https://github.com/y-o-o-z) | Phantom fork modifications, web panel |

## What Phantom Is

Phantom is a modular IRC bot network with a modern web control panel. The bot
core is C++; the panel is a React + TypeScript single-page app served through a
Bun WebSocket-to-TCP proxy.

The bot still follows the classic Psotnic architecture:

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

Core version: `0.1.1 (26-02-24) Phantom fork`.

## Features

- Hub, slave, and leaf bot roles.
- Partyline access over IRC/DCC or the users listener.
- Dynamic module loader for `.so` modules.
- Userlist with flag-based permissions.
- Encrypted config and userlist files derived from per-build seeds.
- IPv4 and IPv6 support.
- Optional TLS through OpenSSL.
- Optional async DNS through ADNS or FireDNS.
- JSON-over-TCP WebAPI for panel integrations.
- React web panel for botnet state, users, bots, channels, topology, audit
  events, IRC server data, and common administrative actions.

## Repository Layout

```text
phantom/
+-- *.cpp / *.h            bot core
+-- modules/               loadable modules
+-- cfg-examples/          neutral example configs
+-- docs/                  protocol docs, old wiki mirror, Polish manuals
+-- easy-rsa/              certificate helper files
+-- webpanel/              React + TypeScript web panel and Bun proxy
+-- AUTHORS                gay-psotnic authors and contributors
+-- AUTHORS-psotnic        original Psotnic authors and contributors
+-- INSTALL                legacy install notes
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

## Build The Bot

From the repository root:

```bash
./configure
make
make modules
```

Useful configure flags:

| Flag | Purpose |
|------|---------|
| `--prefix PATH` | installation directory, default `~/phantom` |
| `--with-debug` | debug build |
| `--with-antiptrace` | compile anti-debugger checks |
| `--no-irc-backtrace` | disable IRC-side crash backtraces |
| `--disable-ssl` | build without OpenSSL |
| `--disable-adns` | use blocking DNS |
| `--disable-modules` | build without dynamic modules |
| `--with-firedns` | use FireDNS |

Install after a successful build:

```bash
make install
```

`./configure` generates `seed.h`. Back it up with your deployment secrets and
do not commit it to a public repository. Configs and userlists encrypted with
one seed set cannot be decrypted with another seed set.

## Configure A Bot

Create a fresh config interactively:

```bash
cd ~/phantom
./phantom -n
```

Neutral examples live in `cfg-examples/`:

- `conf.hub` - main hub.
- `conf.slave` - slave bot.
- `conf.leaf` - IRC-facing leaf.
- `conf.ssl-test` - TLS example.
- `conf.hubtest` and `conf.recursion` - test setups.

A typical hub exposes bot, user, and WebAPI listeners:

```text
listen 0.0.0.0 33100 bots
listen 0.0.0.0 33101 users
listen 127.0.0.1 5555 webapi
```

Keep `webapi` bound to localhost or a trusted private interface. Put TLS and
public access control in front of the web panel/proxy, not directly on the bot
core unless you know exactly why you need it.

## Run The Bot

```bash
cd ~/phantom
./phantom bot.cfg
```

First-time access usually means:

1. Create or import an owner/partyline user.
2. Give that user the required partyline/admin flags.
3. Connect through DCC chat, telnet, or the users listener.
4. Use partyline commands such as `.bots`, `.help`, `.set`, `.bc`, and `.rehash`.

## Modules

Modules are built as shared objects under `modules/` and loaded by path from
the bot config. Module hashes are pinned, so a changed `.so` must be accepted by
updating the config.

Common bundled modules include:

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

To add a module, place its source in `modules/`, rerun `./configure`, then
rebuild:

```bash
make modules
```

## Web Panel

The panel lives in `webpanel/`.

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

Proxy environment variables:

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

The WebAPI is newline-delimited JSON over TCP:

```text
{"type":"auth","data":{"handle":"alice","password":"..."}}\n
```

It provides session authentication, rate limiting, bot/channel/user operations,
audit data, and real-time event broadcasts for the web panel.

Protocol reference: `docs/WEBAPI_PROTOCOL.md`.

## Development Notes

- The web panel is the safest area for routine feature work.
- Bot-core changes affect network compatibility, config handling, and module
  ABI. Keep them small and test them with real config examples.
- Use `ircd_strcmp` / `ircd_strncmp` for IRC-style case folding inside bot
  code.
- Wrap debug-only code in `#ifdef HAVE_DEBUG` or `DEBUG(x)`.
- Keep English and Polish i18n files in `webpanel/src/i18n/` symmetric.

Useful checks:

```bash
cd webpanel
bun run build
bun run test

cd ..
./configure
make
```

## Documentation

- `docs/WEBAPI_PROTOCOL.md` - WebAPI protocol reference.
- `README_PL.md` - Polish overview.
- `docs/SZYBKI_START_PL.md` - Polish quick start.
- `docs/DOKUMENTACJA_PL.md` - Polish manual.
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
