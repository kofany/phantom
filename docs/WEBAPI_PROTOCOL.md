# WebAPI Protocol Specification

**Version:** 1.0
**Transport:** TCP (plain text JSON, line-delimited)
**Port:** 5555 (configurable)

## Overview

WebAPI to prosty protokół JSON over TCP dla panelu webowego. Proxy (Bun) tłumaczy WebSocket ↔ TCP.

```
Browser ←─ WS ─→ Proxy ←─ TCP/JSON ─→ Hub (WebAPI)
```

## Message Format

Każda wiadomość to jedna linia JSON zakończona `\n`:

```json
{"type":"...", "data":{...}}\n
```

## Authentication Flow

### 1. Client → Hub: Auth Request

```json
{"type":"auth","data":{"handle":"patrick","password":"secret123"}}
```

### 2. Hub → Client: Auth Response

**Success:**
```json
{"type":"auth_ok","data":{"handle":"patrick","flags":7,"channels":["#test","#dev"]}}
```

**Failure:**
```json
{"type":"auth_fail","data":{"reason":"invalid password"}}
```

### 3. Hub → Client: Initial State (after auth)

```json
{"type":"init","data":{
  "bots":[
    {"name":"bot1","nick":"Bot1","server":"irc.example.com","status":"online","channels":["#test"]},
    {"name":"bot2","nick":"Bot2","server":"irc.example.com","status":"online","channels":["#test","#dev"]}
  ],
  "channels":[
    {"name":"#test","users":15,"topic":"Test channel"},
    {"name":"#dev","users":8,"topic":"Development"}
  ],
  "users":[
    {"handle":"patrick","flags":7,"online":true},
    {"handle":"admin","flags":3,"online":false}
  ]
}}
```

## Commands (Client → Hub)

### Execute Partyline Command

```json
{"type":"cmd","data":{"cmd":"kick","args":["#test","lamer","spam"]}}
```

Mapowanie na `.kick #test lamer spam`

### Common Commands

| JSON cmd | Partyline | Required Flags |
|----------|-----------|----------------|
| `bots` | `.bots` | HAS_N |
| `upbots` | `.upbots` | HAS_N |
| `downbots` | `.downbots` | HAS_N |
| `channels` | `.channels` | HAS_N |
| `who` | `.who` | HAS_P |
| `whois` | `.whois <handle>` | HAS_P |
| `kick` | `.kick` (via bot) | HAS_O on chan |
| `ban` | `.+ban` | HAS_O on chan |
| `unban` | `.-ban` | HAS_O on chan |
| `adduser` | `.+user` | HAS_S |
| `deluser` | `.-user` | HAS_S |
| `chattr` | `.chattr` | HAS_S |
| `mjoin` | `.mjoin` | HAS_S |
| `mpart` | `.mpart` | HAS_S |
| `save` | `.save` | HAS_S |
| `set` | `.set` | HAS_X |

### Chat Message

```json
{"type":"chat","data":{"text":"Hello everyone!"}}
```

Broadcast do wszystkich połączonych (jak chat w partyline).

## Events (Hub → Client)

### Bot Events

```json
{"type":"bot_join","data":{"name":"bot3","nick":"Bot3","server":"irc.example.com"}}
{"type":"bot_quit","data":{"name":"bot3","reason":"Connection reset"}}
{"type":"bot_nick","data":{"name":"bot1","nick":"NewNick","server":"irc.example.com"}}
```

### Channel Events

```json
{"type":"chan_join","data":{"bot":"bot1","channel":"#newchan"}}
{"type":"chan_part","data":{"bot":"bot1","channel":"#oldchan"}}
{"type":"chan_kick","data":{"bot":"bot1","channel":"#test","who":"lamer","by":"op","reason":"spam"}}
```

### User Events (partyline)

```json
{"type":"user_join","data":{"handle":"admin"}}
{"type":"user_quit","data":{"handle":"admin"}}
{"type":"user_chat","data":{"handle":"patrick","text":"Hello!"}}
```

### Command Response

```json
{"type":"cmd_ok","data":{"cmd":"kick","message":"lamer has been kicked"}}
{"type":"cmd_error","data":{"cmd":"kick","error":"No permission"}}
```

### Userlist Update

```json
{"type":"userlist_update","data":{"action":"add","handle":"newuser","flags":1}}
{"type":"userlist_update","data":{"action":"del","handle":"olduser"}}
{"type":"userlist_update","data":{"action":"chattr","handle":"user","flags":3}}
```

## Flag Values

```cpp
#define HAS_P  0x0001  // Partyline access
#define HAS_N  0x0002  // Channel owner (notify)
#define HAS_S  0x0004  // Super owner
#define HAS_X  0x0008  // Master (all access)
#define HAS_O  0x0010  // Op on channel
#define HAS_A  0x0020  // Auto-op
// ... etc
```

## Permission Filtering

Hub filtruje dane na podstawie flag użytkownika:

- **HAS_P only**: Widzi tylko podstawowe info, chat
- **HAS_N**: Widzi swoje kanały i ich boty
- **HAS_S**: Widzi wszystkie kanały i botów
- **HAS_X**: Pełny dostęp, w tym `.set`

## Error Handling

```json
{"type":"error","data":{"code":"PARSE_ERROR","message":"Invalid JSON"}}
{"type":"error","data":{"code":"AUTH_REQUIRED","message":"Not authenticated"}}
{"type":"error","data":{"code":"NO_PERMISSION","message":"Insufficient flags"}}
{"type":"error","data":{"code":"UNKNOWN_CMD","message":"Unknown command: foo"}}
```

## Keepalive

Client powinien wysyłać ping co 30 sekund:

```json
{"type":"ping"}
```

Hub odpowiada:

```json
{"type":"pong"}
```

Brak pinga przez 60 sekund = disconnect.

## Example Session

```
C: {"type":"auth","data":{"handle":"patrick","password":"secret"}}
S: {"type":"auth_ok","data":{"handle":"patrick","flags":7,"channels":["#test"]}}
S: {"type":"init","data":{"bots":[...],"channels":[...]}}
C: {"type":"cmd","data":{"cmd":"bots"}}
S: {"type":"cmd_ok","data":{"cmd":"bots","result":[{"name":"bot1","status":"online"}]}}
S: {"type":"bot_join","data":{"name":"bot3","nick":"Bot3"}}
C: {"type":"chat","data":{"text":"New bot joined!"}}
S: {"type":"user_chat","data":{"handle":"patrick","text":"New bot joined!"}}
C: {"type":"ping"}
S: {"type":"pong"}
```

## Implementation Notes

1. Hub używa istniejących funkcji partyline do wykonania komend
2. `inetconn` z `STATUS_WEBAPI` zamiast `STATUS_PARTY`
3. Odpowiedzi zbierane do bufora i serializowane do JSON
4. Eventy broadcastowane do wszystkich `STATUS_WEBAPI` połączeń
5. Filtrowanie eventów na podstawie flag użytkownika
