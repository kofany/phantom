# HOWTO: Run Phantom Hub With The Web Panel

This guide starts from a fresh checkout and runs one Phantom hub plus the React
web panel in development mode. Production notes are at the end.

## 1. Build The Hub With WebAPI

From the repository root:

```bash
./configure --with-webapi --prefix="$HOME/phantom"
make
make modules
make install
```

Important: `./configure` generates `seed.h`. Keep the same `seed.h` for the
deployment that owns encrypted configs and userlists. Do not commit `seed.h`.

## 2. Create Or Update Hub Config

The simplest first run is the interactive config creator:

```bash
cd "$HOME/phantom"
./phantom -n
```

When the config exists, make sure the hub has a local WebAPI listener:

```text
listen 127.0.0.1 5555 webapi
```

A typical hub also has listeners for bot links and partyline/users access:

```text
listen 0.0.0.0 33100 bots
listen 0.0.0.0 33101 users
listen 127.0.0.1 5555 webapi
```

Keep `webapi` bound to `127.0.0.1` or a trusted private interface. Do not expose
the raw WebAPI listener directly to the internet.

## 3. Start The Hub

```bash
cd "$HOME/phantom"
./phantom hub.cfg
```

Use the actual config filename created by `./phantom -n`.

The web panel login uses a normal Phantom handle and user password, not the
`ownerpass`. The handle must have partyline privileges. At minimum, login needs
the `+P` flag. Administrative panel actions need the same flags that the
underlying partyline commands require.

If you manage users from partyline, the usual shape is:

```text
.+user admin
.chpass admin <strong-password>
.chattr admin +P
```

Add any extra admin flags your workflow requires.

## 4. Start The WebAPI Proxy

In a second terminal, from the repository checkout:

```bash
cd webpanel
bun install
bun run proxy
```

Default proxy settings:

| Variable | Default | Purpose |
|----------|---------|---------|
| `WS_PORT` | `8080` | WebSocket listen port for the browser |
| `HUB_HOST` | `127.0.0.1` | Phantom hub WebAPI host |
| `HUB_PORT` | `5555` | Phantom hub WebAPI port |
| `HUB_SSL` | `false` | Use TLS for the proxy-to-hub TCP connection |

Example with a non-default hub port:

```bash
HUB_PORT=5556 bun run proxy
```

## 5. Start The Web Panel

In a third terminal:

```bash
cd webpanel
bun run dev
```

Open:

```text
http://localhost:3000
```

Log in with the Phantom handle and user password from step 3.

## 6. Production Shape

Build the static frontend:

```bash
cd webpanel
bun install
bun run build
```

Run the Bun proxy as a service:

```bash
cd webpanel
HUB_HOST=127.0.0.1 HUB_PORT=5555 WS_PORT=8080 bun run proxy
```

Serve `webpanel/dist` through Caddy, nginx, or another HTTPS reverse proxy.
The included `webpanel/Caddyfile` is a starting point:

```bash
cd webpanel
caddy run --config Caddyfile
```

For production, replace `panel.example.com` and the `root` path in the
Caddyfile. Public HTTPS traffic should terminate at the reverse proxy, which
then proxies `/ws` to the Bun proxy on localhost.

## Troubleshooting

- `auth_fail: No partyline privileges`: add `+P` to the handle.
- `auth_fail: Invalid password`: set the user's password again with `.chpass`.
- Panel loads but cannot connect: make sure `bun run proxy` is running and the
  frontend is proxying `/ws` to `localhost:8080`.
- Proxy cannot connect to hub: check that the hub is running and has
  `listen 127.0.0.1 5555 webapi`.
- Login fails from another host: check `.+addr` restrictions for the handle.
- After rebuilding with a different `seed.h`, old encrypted configs/userlists
  may no longer decrypt. Restore the deployment seed or recreate the files.
