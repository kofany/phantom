/***************************************************************************
 *   Copyright (C) 2025                                                    *
 *   WebAPI - JSON interface for web panel                                 *
 *                                                                         *
 *   This program is free software; you can redistribute it and/or modify  *
 *   it under the terms of the GNU General Public License as published by  *
 *   the Free Software Foundation; either version 2 of the License, or     *
 *   (at your option) any later version.                                   *
 ***************************************************************************/

#include "prots.h"
#include "global-var.h"
#include <map>
#include <string>
#include <vector>
#include <algorithm>
#include <cstdlib>

#ifdef HAVE_WEBAPI

// Forward declarations
static bool json_get_string(const char *json, const char *key, char *value, int maxlen);

/*
 * Security Configuration
 */
#define WEBAPI_MAX_ATTEMPTS_PER_MINUTE  3      // Max login attempts per minute per IP
#define WEBAPI_BLOCK_THRESHOLD          5      // Failed attempts before IP block
#define WEBAPI_BLOCK_DURATION           900    // IP block duration in seconds (15 min)
#define WEBAPI_SESSION_EXPIRY           86400  // Session token expiry in seconds (24h)
#define WEBAPI_SESSION_TOKEN_LENGTH     64     // Token length in characters
#define WEBAPI_MAX_SESSIONS             1000   // Max concurrent sessions
#define WEBAPI_CLEANUP_INTERVAL         300    // Cleanup expired data every 5 min

/*
 * Security: Rate Limiting & IP Blocking
 */
struct LoginAttempt {
    time_t timestamp;
    bool success;
};

struct IPSecurityRecord {
    std::vector<LoginAttempt> attempts;
    time_t blocked_until;
    int consecutive_failures;

    IPSecurityRecord() : blocked_until(0), consecutive_failures(0) {}
};

static std::map<std::string, IPSecurityRecord> ip_security_records;
static time_t last_security_cleanup = 0;

// Clean up old records periodically
static void webapi_security_cleanup()
{
    time_t now = NOW;
    if (now - last_security_cleanup < WEBAPI_CLEANUP_INTERVAL)
        return;

    last_security_cleanup = now;
    time_t cutoff = now - 60; // Keep only last minute of attempts

    auto it = ip_security_records.begin();
    while (it != ip_security_records.end()) {
        // Remove old attempts
        auto& attempts = it->second.attempts;
        attempts.erase(
            std::remove_if(attempts.begin(), attempts.end(),
                [cutoff](const LoginAttempt& a) { return a.timestamp < cutoff; }),
            attempts.end()
        );

        // Remove record if empty and not blocked
        if (attempts.empty() && it->second.blocked_until < now) {
            it = ip_security_records.erase(it);
        } else {
            ++it;
        }
    }
}

// Check if IP is currently blocked
static bool webapi_is_ip_blocked(const char *ip)
{
    auto it = ip_security_records.find(ip);
    if (it == ip_security_records.end())
        return false;

    if (it->second.blocked_until > NOW) {
        return true;
    }
    return false;
}

// Get remaining block time for IP
static int webapi_get_block_remaining(const char *ip)
{
    auto it = ip_security_records.find(ip);
    if (it == ip_security_records.end())
        return 0;

    int remaining = it->second.blocked_until - NOW;
    return remaining > 0 ? remaining : 0;
}

// Check rate limit - returns true if allowed, false if rate limited
static bool webapi_check_rate_limit(const char *ip)
{
    webapi_security_cleanup();

    auto& record = ip_security_records[ip];
    time_t now = NOW;
    time_t minute_ago = now - 60;

    // Count attempts in last minute
    int recent_attempts = 0;
    for (const auto& attempt : record.attempts) {
        if (attempt.timestamp >= minute_ago)
            recent_attempts++;
    }

    return recent_attempts < WEBAPI_MAX_ATTEMPTS_PER_MINUTE;
}

// Check if connection is from trusted proxy (localhost)
static bool webapi_is_trusted_proxy(const char *ip)
{
    if (!ip) return false;
    // Trust localhost connections (where proxy runs)
    if (!strcmp(ip, "127.0.0.1") || !strcmp(ip, "::1") || !strcmp(ip, "localhost"))
        return true;
    // Also trust IPv6 localhost variations
    if (!strncmp(ip, "::ffff:127.", 11))
        return true;
    return false;
}

// Get real client IP - from JSON if trusted proxy, otherwise from connection
static const char* webapi_get_real_ip(inetconn *c, const char *json, char *buf, size_t bufsize)
{
    const char *conn_ip = c->getPeerIpName();

    // Only trust client_ip from JSON if connection is from trusted proxy
    if (webapi_is_trusted_proxy(conn_ip)) {
        if (json_get_string(json, "client_ip", buf, bufsize) && buf[0]) {
            return buf;
        }
    }

    // Fallback to connection IP
    strncpy(buf, conn_ip, bufsize - 1);
    buf[bufsize - 1] = '\0';
    return buf;
}

// Record a login attempt
static void webapi_record_login_attempt(const char *ip, bool success)
{
    auto& record = ip_security_records[ip];

    LoginAttempt attempt;
    attempt.timestamp = NOW;
    attempt.success = success;
    record.attempts.push_back(attempt);

    if (success) {
        record.consecutive_failures = 0;
        record.blocked_until = 0;
    } else {
        record.consecutive_failures++;

        // Block IP if threshold exceeded
        if (record.consecutive_failures >= WEBAPI_BLOCK_THRESHOLD) {
            record.blocked_until = NOW + WEBAPI_BLOCK_DURATION;
            net.send(HAS_N, "\0034[WebAPI Security] IP %s blocked for %d minutes after %d failed attempts\003",
                     ip, WEBAPI_BLOCK_DURATION / 60, record.consecutive_failures);
        }
    }
}

/*
 * Security: Session Tokens
 */
struct WebAPISession {
    std::string token;
    std::string handle;
    std::string ip;
    time_t created;
    time_t expires;
    time_t last_used;
};

static std::map<std::string, WebAPISession> active_sessions;
static std::map<std::string, std::string> handle_to_token; // For single session per user

// Generate cryptographically secure random token
static std::string webapi_generate_token()
{
    static const char charset[] =
        "abcdefghijklmnopqrstuvwxyz"
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        "0123456789";

    std::string token;
    token.reserve(WEBAPI_SESSION_TOKEN_LENGTH);

    // Use /dev/urandom for secure randomness
    FILE *urandom = fopen("/dev/urandom", "rb");
    if (urandom) {
        unsigned char buf[WEBAPI_SESSION_TOKEN_LENGTH];
        if (fread(buf, 1, WEBAPI_SESSION_TOKEN_LENGTH, urandom) == WEBAPI_SESSION_TOKEN_LENGTH) {
            for (int i = 0; i < WEBAPI_SESSION_TOKEN_LENGTH; i++) {
                token += charset[buf[i] % (sizeof(charset) - 1)];
            }
        }
        fclose(urandom);
    }

    // Fallback to less secure method if urandom fails
    if (token.empty()) {
        srand(NOW ^ getpid());
        for (int i = 0; i < WEBAPI_SESSION_TOKEN_LENGTH; i++) {
            token += charset[rand() % (sizeof(charset) - 1)];
        }
    }

    return token;
}

// Create new session, returns token
static std::string webapi_create_session(const char *handle, const char *ip)
{
    // Clean up expired sessions first
    time_t now = NOW;
    auto it = active_sessions.begin();
    while (it != active_sessions.end()) {
        if (it->second.expires < now) {
            handle_to_token.erase(it->second.handle);
            it = active_sessions.erase(it);
        } else {
            ++it;
        }
    }

    // Enforce max sessions limit
    while (active_sessions.size() >= WEBAPI_MAX_SESSIONS) {
        // Remove oldest session
        auto oldest = active_sessions.begin();
        for (auto it = active_sessions.begin(); it != active_sessions.end(); ++it) {
            if (it->second.last_used < oldest->second.last_used)
                oldest = it;
        }
        handle_to_token.erase(oldest->second.handle);
        active_sessions.erase(oldest);
    }

    // Invalidate existing session for this handle (single session per user)
    auto existing = handle_to_token.find(handle);
    if (existing != handle_to_token.end()) {
        active_sessions.erase(existing->second);
        handle_to_token.erase(existing);
    }

    // Create new session
    std::string token = webapi_generate_token();

    WebAPISession session;
    session.token = token;
    session.handle = handle;
    session.ip = ip;
    session.created = now;
    session.expires = now + WEBAPI_SESSION_EXPIRY;
    session.last_used = now;

    active_sessions[token] = session;
    handle_to_token[handle] = token;

    return token;
}

// Validate session token, returns handle if valid or empty string
static std::string webapi_validate_session(const char *token, const char *ip)
{
    auto it = active_sessions.find(token);
    if (it == active_sessions.end())
        return "";

    WebAPISession& session = it->second;

    // Check expiry
    if (session.expires < NOW) {
        handle_to_token.erase(session.handle);
        active_sessions.erase(it);
        return "";
    }

    // Update last used
    session.last_used = NOW;

    return session.handle;
}

// Invalidate session (logout)
static void webapi_destroy_session(const char *token)
{
    auto it = active_sessions.find(token);
    if (it != active_sessions.end()) {
        handle_to_token.erase(it->second.handle);
        active_sessions.erase(it);
    }
}

// Extend session expiry (on activity)
static void webapi_touch_session(const char *token)
{
    auto it = active_sessions.find(token);
    if (it != active_sessions.end()) {
        it->second.last_used = NOW;
        // Optionally extend expiry on activity:
        // it->second.expires = NOW + WEBAPI_SESSION_EXPIRY;
    }
}

// Get session count (for monitoring)
static int webapi_get_active_sessions()
{
    return active_sessions.size();
}

/*
 * Minimal JSON helpers
 * Format: {"type":"...","data":{...}}
 */

static bool json_get_string(const char *json, const char *key, char *value, int maxlen)
{
    char search[128];
    snprintf(search, sizeof(search), "\"%s\":\"", key);

    const char *start = strstr(json, search);
    if (!start) return false;

    start += strlen(search);
    const char *end = strchr(start, '"');
    if (!end) return false;

    int len = end - start;
    if (len >= maxlen) len = maxlen - 1;

    strncpy(value, start, len);
    value[len] = '\0';
    return true;
}

static bool json_get_type(const char *json, char *type, int maxlen)
{
    return json_get_string(json, "type", type, maxlen);
}

/*
 * JSON response builder
 */

class JsonResponse {
private:
    char buf[MAX_LEN * 4];
    int pos;
    bool first_field;

public:
    JsonResponse() : pos(0), first_field(true) {
        buf[0] = '\0';
    }

    void start(const char *type) {
        pos = snprintf(buf, sizeof(buf), "{\"type\":\"%s\",\"data\":{", type);
        first_field = true;
    }

    void add_string(const char *key, const char *value) {
        if (!first_field) buf[pos++] = ',';
        first_field = false;

        // Escape special characters in value
        char escaped[MAX_LEN];
        int j = 0;
        for (int i = 0; value[i] && j < MAX_LEN - 2; i++) {
            switch (value[i]) {
                case '"':  escaped[j++] = '\\'; escaped[j++] = '"'; break;
                case '\\': escaped[j++] = '\\'; escaped[j++] = '\\'; break;
                case '\n': escaped[j++] = '\\'; escaped[j++] = 'n'; break;
                case '\r': escaped[j++] = '\\'; escaped[j++] = 'r'; break;
                case '\t': escaped[j++] = '\\'; escaped[j++] = 't'; break;
                default:   escaped[j++] = value[i]; break;
            }
        }
        escaped[j] = '\0';

        pos += snprintf(buf + pos, sizeof(buf) - pos, "\"%s\":\"%s\"", key, escaped);
    }

    void add_int(const char *key, int value) {
        if (!first_field) buf[pos++] = ',';
        first_field = false;
        pos += snprintf(buf + pos, sizeof(buf) - pos, "\"%s\":%d", key, value);
    }

    void add_bool(const char *key, bool value) {
        if (!first_field) buf[pos++] = ',';
        first_field = false;
        pos += snprintf(buf + pos, sizeof(buf) - pos, "\"%s\":%s", key, value ? "true" : "false");
    }

    void start_array(const char *key) {
        if (!first_field) buf[pos++] = ',';
        first_field = true;
        pos += snprintf(buf + pos, sizeof(buf) - pos, "\"%s\":[", key);
    }

    void end_array() {
        pos += snprintf(buf + pos, sizeof(buf) - pos, "]");
        first_field = false;
    }

    // Add plain string to array (no key)
    void add_array_item(const char *value) {
        if (!first_field) buf[pos++] = ',';
        first_field = false;

        // Escape special characters
        char escaped[MAX_LEN];
        int j = 0;
        for (int i = 0; value && value[i] && j < MAX_LEN - 2; i++) {
            switch (value[i]) {
                case '"':  escaped[j++] = '\\'; escaped[j++] = '"'; break;
                case '\\': escaped[j++] = '\\'; escaped[j++] = '\\'; break;
                case '\n': escaped[j++] = '\\'; escaped[j++] = 'n'; break;
                case '\r': escaped[j++] = '\\'; escaped[j++] = 'r'; break;
                case '\t': escaped[j++] = '\\'; escaped[j++] = 't'; break;
                default:   escaped[j++] = value[i]; break;
            }
        }
        escaped[j] = '\0';

        pos += snprintf(buf + pos, sizeof(buf) - pos, "\"%s\"", escaped);
    }

    void start_object() {
        if (!first_field) buf[pos++] = ',';
        first_field = true;
        buf[pos++] = '{';
    }

    void end_object() {
        buf[pos++] = '}';
        first_field = false;
    }

    const char *finish() {
        snprintf(buf + pos, sizeof(buf) - pos, "}}");
        return buf;
    }

    const char *finish_simple() {
        snprintf(buf + pos, sizeof(buf) - pos, "}");
        return buf;
    }
};

/*
 * Send JSON response to webapi connection
 */

static void webapi_send(inetconn *c, const char *json)
{
    // Direct write without snprintf copy - just write JSON + newline
    int json_len = strlen(json);
    write(c->fd, json, json_len);
    write(c->fd, "\n", 1);
}

static void webapi_send_error(inetconn *c, const char *code, const char *message)
{
    JsonResponse r;
    r.start("error");
    r.add_string("code", code);
    r.add_string("message", message);
    webapi_send(c, r.finish());
}

static void webapi_send_auth_ok(inetconn *c, const char *token = NULL)
{
    JsonResponse r;
    r.start("auth_ok");
    r.add_string("handle", c->handle->name);
    r.add_int("flags", c->handle->flags[GLOBAL]);
    if (token && *token) {
        r.add_string("token", token);
        r.add_int("tokenExpiry", WEBAPI_SESSION_EXPIRY);
    }
    webapi_send(c, r.finish());
}

static void webapi_send_auth_fail(inetconn *c, const char *reason)
{
    JsonResponse r;
    r.start("auth_fail");
    r.add_string("reason", reason);
    webapi_send(c, r.finish());
}

/*
 * Send initial state after auth
 */

static void webapi_send_init(inetconn *c)
{
    JsonResponse r;
    r.start("init");

    // Bots array
    r.start_array("bots");
    for (int i = 0; i < net.max_conns; ++i) {
        if (net.conn[i].isRegBot()) {
            r.start_object();
            r.add_string("name", net.conn[i].handle->name);
            r.add_string("nick", net.conn[i].name ? net.conn[i].name : "");
            r.add_string("server", net.conn[i].origin ? net.conn[i].origin : "");
            r.add_bool("online", true);
            r.end_object();
        }
    }
    r.end_array();

    // Channels array (from userlist)
    r.start_array("channels");
    for (int i = 0; i < MAX_CHANNELS; ++i) {
        if (userlist.chanlist[i].name && *userlist.chanlist[i].name) {
            // Check if user has access to this channel
            if (c->handle->flags[GLOBAL] & (HAS_S | HAS_X) ||
                c->handle->flags[i] & HAS_N) {
                r.start_object();
                r.add_string("name", userlist.chanlist[i].name);
                r.end_object();
            }
        }
    }
    r.end_array();

    // Connected users (partyline)
    r.start_array("users");
    for (int i = 0; i < net.max_conns; ++i) {
        if (net.conn[i].isRegUser()) {
            r.start_object();
            r.add_string("handle", net.conn[i].name);
            r.add_bool("online", true);
            r.end_object();
        }
    }
    r.end_array();

    webapi_send(c, r.finish());
}

/*
 * Handle authenticated commands
 */

static void webapi_handle_cmd(inetconn *c, const char *json)
{
    char cmd[MAX_LEN], args_str[MAX_LEN];

    if (!json_get_string(json, "cmd", cmd, sizeof(cmd))) {
        webapi_send_error(c, "INVALID_CMD", "Missing cmd field");
        return;
    }

    // Build partyline-style command string
    char partyline_cmd[MAX_LEN];

    // Try to extract args (simplified - just get the raw args string)
    // In practice we'd parse the args array properly
    if (json_get_string(json, "args", args_str, sizeof(args_str))) {
        snprintf(partyline_cmd, sizeof(partyline_cmd), ".%s %s", cmd, args_str);
    } else {
        snprintf(partyline_cmd, sizeof(partyline_cmd), ".%s", cmd);
    }

    // Find and execute the partyline command handler
    extern partyline_commands partyline_cmds[];
    char arg[10][MAX_LEN];
    int argc = str2words(arg[0], partyline_cmd, 10, MAX_LEN);

    for (partyline_commands *pt = partyline_cmds; pt->command != NULL; pt++) {
        if (pt->main_only && config.bottype != BOT_MAIN)
            continue;

        if (!strcmp(pt->command, arg[0] + 1)) {  // +1 to skip the dot
            if (argc - 1 < pt->min_args) {
                webapi_send_error(c, "INVALID_ARGS", "Not enough arguments");
                return;
            }

            // Execute command
            // Note: Response will be sent via c->send() which we intercept
            int result = pt->func(c, partyline_cmd, arg, argc - 1);

            // Send success response
            JsonResponse r;
            r.start("cmd_ok");
            r.add_string("cmd", cmd);
            r.add_int("result", result);
            webapi_send(c, r.finish());
            return;
        }
    }

    webapi_send_error(c, "UNKNOWN_CMD", "Unknown command");
}

/*
 * Handle chat message
 */

static void webapi_handle_chat(inetconn *c, const char *json)
{
    char text[MAX_LEN];

    if (!json_get_string(json, "text", text, sizeof(text))) {
        webapi_send_error(c, "INVALID_CHAT", "Missing text field");
        return;
    }

    // Broadcast to all connected users (partyline + webapi)
    webapi_broadcast_chat(c->name, text);

    // Also send to regular partyline users
    for (int i = 0; i < net.max_conns; ++i) {
        if (net.conn[i].fd && net.conn[i].isRegUser() &&
            !(net.conn[i].status & STATUS_WEBAPI)) {
            net.conn[i].send("<%s> %s", c->name, text);
        }
    }
}

/*
 * Handle list_channels request
 * Returns channels the user has access to with counts
 */

static int count_sticky_bans(protmodelist *pl)
{
    if (!pl) return 0;
    int count = 0;
    for (ptrlist<protmodelist::entry>::iterator i = pl->data.begin(); i; i++) {
        if (i->sticky) count++;
    }
    return count;
}

static void webapi_handle_list_channels(inetconn *c)
{
    JsonResponse r;
    r.start("list_channels");
    r.start_array("channels");

    bool is_super = (c->handle->flags[GLOBAL] & (HAS_S | HAS_X)) != 0;

    for (int i = 0; i < MAX_CHANNELS; ++i) {
        if (!userlist.chanlist[i].name || !*userlist.chanlist[i].name)
            continue;

        // Check access: super users see all, others need +N on channel
        int chan_flags = c->handle->flags[i];
        if (!is_super && !(chan_flags & HAS_N))
            continue;

        r.start_object();
        r.add_string("name", userlist.chanlist[i].name);
        r.add_int("index", i);
        r.add_int("userFlags", chan_flags);

        // Count protlist entries
        protmodelist *bans = userlist.chanlist[i].protlist[BAN];
        protmodelist *exempts = userlist.chanlist[i].protlist[EXEMPT];
        protmodelist *invites = userlist.chanlist[i].protlist[INVITE];
        protmodelist *reops = userlist.chanlist[i].protlist[REOP];

        r.add_int("bansCount", bans ? bans->data.entries() : 0);
        r.add_int("sticksCount", count_sticky_bans(bans));
        r.add_int("exemptsCount", exempts ? exempts->data.entries() : 0);
        r.add_int("invitesCount", invites ? invites->data.entries() : 0);
        r.add_int("reopsCount", reops ? reops->data.entries() : 0);

        // Count users with access to this channel
        int user_count = 0;
        HANDLE *h = userlist.first;
        while (h) {
            if (h->flags[i])
                user_count++;
            h = h->next;
        }
        r.add_int("usersCount", user_count);

        // Op lockdown status
        r.add_bool("opLockdown", (bool) userlist.chanlist[i].chset->OP_LOCKDOWN);

        r.end_object();
    }

    r.end_array();
    webapi_send(c, r.finish());
}

/*
 * Handle list_users request
 * Returns users the caller has access to view
 */

static void webapi_handle_list_users(inetconn *c)
{
    JsonResponse r;
    r.start("list_users");
    r.start_array("users");

    bool is_super = (c->handle->flags[GLOBAL] & (HAS_S | HAS_X)) != 0;

    HANDLE *h = userlist.first;
    while (h) {
        if (!h->name) {
            h = h->next;
            continue;
        }

        // Check read access
        if (!is_super && !userlist.hasReadAccess(c, h)) {
            h = h->next;
            continue;
        }

        r.start_object();
        r.add_string("name", h->name);
        r.add_int("flags", h->flags[GLOBAL]);

        // Check if this user is a bot
        bool is_bot = (h->flags[GLOBAL] & HAS_B) != 0;
        r.add_bool("isBot", is_bot);

        // Check if online
        bool online = false;
        for (int j = 0; j < net.max_conns; ++j) {
            if (net.conn[j].fd && net.conn[j].handle == h) {
                online = true;
                break;
            }
        }
        r.add_bool("online", online);

        // Add channel-specific flags
        r.start_array("channelFlags");
        int chan_count = 0;
        for (int j = 0; j < MAX_CHANNELS; j++) {
            if (userlist.chanlist[j].name && h->flags[j]) {
                r.start_object();
                r.add_string("channel", userlist.chanlist[j].name);
                r.add_int("flags", h->flags[j]);
                r.end_object();
                chan_count++;
            }
        }
        r.end_array();
        r.add_int("channelsCount", chan_count);

        // Count hosts
        r.add_int("hostsCount", h->addr ? h->addr->data.entries() : 0);

        r.end_object();
        h = h->next;
    }

    r.end_array();
    webapi_send(c, r.finish());
}

/*
 * Handle get_user request
 * Returns detailed user info including all hosts and per-channel flags
 */

static void webapi_handle_get_user(inetconn *c, const char *json)
{
    char name[MAX_LEN];
    if (!json_get_string(json, "name", name, sizeof(name))) {
        webapi_send_error(c, "MISSING_PARAM", "Missing user name");
        return;
    }

    HANDLE *h = userlist.findHandle(name);
    if (!h) {
        webapi_send_error(c, "NOT_FOUND", "User not found");
        return;
    }

    // Check read access
    bool is_super = (c->handle->flags[GLOBAL] & (HAS_S | HAS_X)) != 0;
    if (!is_super && !userlist.hasReadAccess(c, h)) {
        webapi_send_error(c, "NO_PERMISSION", "No permission to view this user");
        return;
    }

    JsonResponse r;
    r.start("get_user");

    r.add_string("name", h->name);
    r.add_int("flags", h->flags[GLOBAL]);

    bool is_bot = (h->flags[GLOBAL] & HAS_B) != 0;
    r.add_bool("isBot", is_bot);

    // Check if online
    bool online = false;
    for (int j = 0; j < net.max_conns; ++j) {
        if (net.conn[j].fd && net.conn[j].handle == h) {
            online = true;
            break;
        }
    }
    r.add_bool("online", online);

    // Password status - pass is unsigned char[16], check if first byte is non-zero
    r.add_bool("hasPassword", h->pass[0] != 0);

    // Creation info
    if (h->creation) {
        r.add_int("createdAt", h->creation->tv.tv_sec);
    }
    if (h->createdBy) {
        r.add_string("createdBy", h->createdBy);
    }

    // All hosts
    r.start_array("hosts");
    for (int i = 0; i < MAX_HOSTS; i++) {
        if (h->host[i]) {
            r.add_array_item(h->host[i]);
        }
    }
    r.end_array();

    // Address info (if any)
    r.start_array("addresses");
    if (h->addr) {
        ptrlist<HANDLE::ADDR::entry>::iterator ai = h->addr->data.begin();
        while (ai) {
            r.start_object();
            r.add_string("ip", ai->ip);
            r.end_object();
            ai++;
        }
    }
    r.end_array();

    // Per-channel flags
    r.start_array("channelFlags");
    for (int j = 0; j < MAX_CHANNELS; j++) {
        if (userlist.chanlist[j].name && h->flags[j]) {
            r.start_object();
            r.add_string("channel", userlist.chanlist[j].name);
            r.add_int("flags", h->flags[j]);
            r.end_object();
        }
    }
    r.end_array();

    // Info entries
    r.start_array("info");
    if (h->info) {
        ptrlist<comment::entry>::iterator ie = h->info->data.begin();
        while (ie) {
            r.start_object();
            r.add_string("key", ie->key ? ie->key : "");
            r.add_string("value", ie->value ? ie->value : "");
            r.end_object();
            ie++;
        }
    }
    r.end_array();

    webapi_send(c, r.finish());
}

/*
 * Handle list_bots request
 * Returns connected bots
 */

static void webapi_handle_list_bots(inetconn *c)
{
    // Require at least +N to view bots
    if (!(c->handle->flags[GLOBAL] & (HAS_N | HAS_S | HAS_X))) {
        webapi_send_error(c, "NO_PERMISSION", "Brak uprawnień do przeglądania botów");
        return;
    }

    JsonResponse r;
    r.start("list_bots");
    r.start_array("bots");

    for (int i = 0; i < net.max_conns; ++i) {
        if (!net.conn[i].fd) continue;
        if (!net.conn[i].isRegBot()) continue;

        r.start_object();
        r.add_string("name", net.conn[i].handle ? net.conn[i].handle->name : "");
        r.add_string("nick", net.conn[i].name ? net.conn[i].name : "");
        r.add_string("server", net.conn[i].origin ? net.conn[i].origin : "");
        r.add_bool("online", true);

        // Connection info
        r.add_string("ip", net.conn[i].getPeerIpName());

        r.end_object();
    }

    r.end_array();
    webapi_send(c, r.finish());
}

/*
 * Handle get_channel request
 * Returns detailed channel info including protlists
 */

static void webapi_handle_get_channel(inetconn *c, const char *json)
{
    char channel[MAX_LEN];

    if (!json_get_string(json, "channel", channel, sizeof(channel))) {
        webapi_send_error(c, "INVALID_REQUEST", "Missing channel field");
        return;
    }

    // Find channel index
    int chan_idx = userlist.findChannel(channel);
    if (chan_idx < 0) {
        webapi_send_error(c, "NOT_FOUND", "Kanał nie istnieje");
        return;
    }

    // Check access
    bool is_super = (c->handle->flags[GLOBAL] & (HAS_S | HAS_X)) != 0;
    int chan_flags = c->handle->flags[chan_idx];
    if (!is_super && !(chan_flags & HAS_N)) {
        webapi_send_error(c, "NO_PERMISSION", "Brak uprawnień do tego kanału");
        return;
    }

    CHANLIST *ch = &userlist.chanlist[chan_idx];

    JsonResponse r;
    r.start("get_channel");
    r.add_string("name", ch->name);
    r.add_int("index", chan_idx);

    // Chanset values
    r.start_array("chset");
    if (ch->chset) {
        // Iterate through chanset options
        for (ptrlist<ent>::iterator e = ch->chset->list.begin(); e; e++) {
            if (e->isPrintable()) {
                r.start_object();
                r.add_string("name", e->getName());
                r.add_string("value", e->getValue());
                r.end_object();
            }
        }
    }
    r.end_array();

    // Users with access to this channel
    r.start_array("users");
    HANDLE *h = userlist.first;
    while (h) {
        if (!h->name || !h->flags[chan_idx]) {
            h = h->next;
            continue;
        }

        r.start_object();
        r.add_string("name", h->name);
        r.add_int("flags", h->flags[chan_idx]);
        r.add_int("globalFlags", h->flags[GLOBAL]);

        // Check if online
        bool online = false;
        for (int j = 0; j < net.max_conns; ++j) {
            if (net.conn[j].fd && net.conn[j].handle == h) {
                online = true;
                break;
            }
        }
        r.add_bool("online", online);
        r.end_object();
        h = h->next;
    }
    r.end_array();

    // Bans
    r.start_array("bans");
    if (ch->protlist[BAN]) {
        for (ptrlist<protmodelist::entry>::iterator i = ch->protlist[BAN]->data.begin(); i; i++) {
            if (i->sticky) continue;  // Sticks are separate
            r.start_object();
            r.add_string("mask", i->mask ? i->mask : "");
            r.add_string("reason", i->reason ? i->reason : "");
            r.add_string("by", i->by ? i->by : "");
            r.add_int("when", (int)i->when);
            r.add_int("expires", (int)i->expires);
            r.end_object();
        }
    }
    r.end_array();

    // Sticks (sticky bans)
    r.start_array("sticks");
    if (ch->protlist[BAN]) {
        for (ptrlist<protmodelist::entry>::iterator i = ch->protlist[BAN]->data.begin(); i; i++) {
            if (!i->sticky) continue;
            r.start_object();
            r.add_string("mask", i->mask ? i->mask : "");
            r.add_string("reason", i->reason ? i->reason : "");
            r.add_string("by", i->by ? i->by : "");
            r.add_int("when", (int)i->when);
            r.add_int("expires", (int)i->expires);
            r.end_object();
        }
    }
    r.end_array();

    // Exempts
    r.start_array("exempts");
    if (ch->protlist[EXEMPT]) {
        for (ptrlist<protmodelist::entry>::iterator i = ch->protlist[EXEMPT]->data.begin(); i; i++) {
            r.start_object();
            r.add_string("mask", i->mask ? i->mask : "");
            r.add_string("reason", i->reason ? i->reason : "");
            r.add_string("by", i->by ? i->by : "");
            r.add_int("when", (int)i->when);
            r.add_int("expires", (int)i->expires);
            r.end_object();
        }
    }
    r.end_array();

    // Invites
    r.start_array("invites");
    if (ch->protlist[INVITE]) {
        for (ptrlist<protmodelist::entry>::iterator i = ch->protlist[INVITE]->data.begin(); i; i++) {
            r.start_object();
            r.add_string("mask", i->mask ? i->mask : "");
            r.add_string("reason", i->reason ? i->reason : "");
            r.add_string("by", i->by ? i->by : "");
            r.add_int("when", (int)i->when);
            r.add_int("expires", (int)i->expires);
            r.end_object();
        }
    }
    r.end_array();

    // Reops
    r.start_array("reops");
    if (ch->protlist[REOP]) {
        for (ptrlist<protmodelist::entry>::iterator i = ch->protlist[REOP]->data.begin(); i; i++) {
            r.start_object();
            r.add_string("mask", i->mask ? i->mask : "");
            r.add_string("reason", i->reason ? i->reason : "");
            r.add_string("by", i->by ? i->by : "");
            r.add_int("when", (int)i->when);
            r.add_int("expires", (int)i->expires);
            r.end_object();
        }
    }
    r.end_array();

    webapi_send(c, r.finish());
}

/*
 * CRUD: Add user
 */
static void webapi_handle_add_user(inetconn *c, const char *json)
{
    char name[MAX_LEN], host[MAX_LEN];

    if (!json_get_string(json, "name", name, sizeof(name))) {
        webapi_send_error(c, "INVALID_REQUEST", "Missing name field");
        return;
    }

    // Check permission - need +N globally or on any channel
    bool has_perm = (c->handle->flags[GLOBAL] & HAS_N) != 0;
    if (!has_perm) {
        for (int i = 0; i < MAX_CHANNELS && !has_perm; i++) {
            if (c->handle->flags[i] & HAS_N) has_perm = true;
        }
    }
    if (!has_perm) {
        webapi_send_error(c, "NO_PERMISSION", "Brak uprawnień");
        return;
    }

    if (!isRealStr(name)) {
        webapi_send_error(c, "INVALID_NAME", "Nieprawidłowa nazwa");
        return;
    }

    if (strlen(name) > MAX_HANDLE_LEN) {
        webapi_send_error(c, "NAME_TOO_LONG", "Nazwa za długa");
        return;
    }

    HANDLE *h;
    if (json_get_string(json, "host", host, sizeof(host)) && *host) {
        char buf[MAX_LEN];
        if (!extendhost(host, buf, MAX_LEN)) {
            webapi_send_error(c, "INVALID_HOST", "Nieprawidłowy host");
            return;
        }
        h = userlist.addHandle(name, 0, 0, 0, 0, c->name);
        if (h) {
            userlist.addHost(h, buf, c->name, NOW);
            net.send(HAS_B, "%s %s %s", S_ADDUSER, name, h->creation->print());
            net.send(HAS_B, "%s %s %s", S_ADDHOST, name, buf);
            userlist.SN++;
            userlist.updated();
        }
    } else {
        h = userlist.addHandle(name, 0, 0, 0, 0, c->name);
        if (h) {
            net.send(HAS_B, "%s %s %s", S_ADDUSER, name, h->creation->print());
            userlist.updated();
        }
    }

    if (h) {
        JsonResponse r;
        r.start("add_user_ok");
        r.add_string("name", name);
        webapi_send(c, r.finish());
    } else {
        webapi_send_error(c, "USER_EXISTS", "Użytkownik już istnieje");
    }
}

/*
 * CRUD: Delete user
 */
static void webapi_handle_del_user(inetconn *c, const char *json)
{
    char name[MAX_LEN];

    if (!json_get_string(json, "name", name, sizeof(name))) {
        webapi_send_error(c, "INVALID_REQUEST", "Missing name field");
        return;
    }

    if (!(c->handle->flags[GLOBAL] & HAS_N)) {
        webapi_send_error(c, "NO_PERMISSION", "Brak uprawnień");
        return;
    }

    HANDLE *h = userlist.findHandle(name);
    if (!h || userlist.isBot(h)) {
        webapi_send_error(c, "INVALID_USER", "Nieprawidłowy użytkownik");
        return;
    }

    if (!userlist.hasWriteAccess(c, name)) {
        webapi_send_error(c, "NO_PERMISSION", "Brak uprawnień do tego użytkownika");
        return;
    }

    if (userlist.removeHandle(name) == -1) {
        webapi_send_error(c, "IMMORTAL_USER", "Użytkownik jest nieśmiertelny");
        return;
    }

    net.send(HAS_B, "%s %s", S_RMUSER, name);
    userlist.updated();

    JsonResponse r;
    r.start("del_user_ok");
    r.add_string("name", name);
    webapi_send(c, r.finish());
}

/*
 * CRUD: Set user flags
 */
static void webapi_handle_set_user_flags(inetconn *c, const char *json)
{
    char name[MAX_LEN], flags[MAX_LEN], channel[MAX_LEN];

    if (!json_get_string(json, "name", name, sizeof(name)) ||
        !json_get_string(json, "flags", flags, sizeof(flags))) {
        webapi_send_error(c, "INVALID_REQUEST", "Missing name or flags");
        return;
    }

    json_get_string(json, "channel", channel, sizeof(channel));

    int result = userlist.changeFlags(name, flags, channel, c);
    switch (result) {
        case -1: webapi_send_error(c, "INVALID_USER", "Nieprawidłowy użytkownik"); return;
        case -2: webapi_send_error(c, "INVALID_CHANNEL", "Nieprawidłowy kanał"); return;
        case -3: webapi_send_error(c, "NO_PERMISSION", "Brak uprawnień"); return;
        case -4: webapi_send_error(c, "INVALID_FLAGS", "Nieprawidłowe flagi kanałowe"); return;
        case -5: webapi_send_error(c, "INVALID_FLAGS", "Nieprawidłowe flagi"); return;
        case -6: webapi_send_error(c, "INVALID_FLAGS", "Nieprawidłowe flagi globalne"); return;
        case -7: webapi_send_error(c, "FLAGS_CONFLICT", "Konflikt flag"); return;
    }

    char buf[MAX_LEN];
    userlist.flags2str(result, buf);

    if (*channel) {
        net.send(HAS_B, "%s %s %s %s", S_CHATTR, name, flags, channel);
    } else {
        net.send(HAS_B, "%s %s %s", S_CHATTR, name, flags);
    }
    userlist.updated();
    ME.nextRecheck = NOW + SAVEDELAY;

    JsonResponse r;
    r.start("set_user_flags_ok");
    r.add_string("name", name);
    r.add_string("flags", buf);
    webapi_send(c, r.finish());
}

/*
 * CRUD: Set user password
 */
static void webapi_handle_set_user_pass(inetconn *c, const char *json)
{
    char name[MAX_LEN], password[MAX_LEN];

    if (!json_get_string(json, "name", name, sizeof(name)) ||
        !json_get_string(json, "password", password, sizeof(password))) {
        webapi_send_error(c, "INVALID_REQUEST", "Missing name or password");
        return;
    }

    HANDLE *h = userlist.findHandle(name);
    if (!h) {
        webapi_send_error(c, "INVALID_USER", "Nieprawidłowy użytkownik");
        return;
    }

    if (!userlist.hasWriteAccess(c, h)) {
        webapi_send_error(c, "NO_PERMISSION", "Brak uprawnień");
        return;
    }

    if (strlen(password) < 8) {
        webapi_send_error(c, "PASSWORD_TOO_SHORT", "Hasło musi mieć min. 8 znaków");
        return;
    }

    h = userlist.changePass(name, password);
    if (!h) {
        webapi_send_error(c, "INVALID_USER", "Nieprawidłowy użytkownik");
        return;
    }

    char buf[MAX_LEN];
    net.send(HAS_B, "%s %s %s", S_PASSWD, name, quoteHexStr(h->pass, buf));
    userlist.updated();

    JsonResponse r;
    r.start("set_user_pass_ok");
    r.add_string("name", name);
    webapi_send(c, r.finish());
}

/*
 * CRUD: Add host
 */
static void webapi_handle_add_host(inetconn *c, const char *json)
{
    char name[MAX_LEN], host[MAX_LEN], buf[MAX_LEN];

    if (!json_get_string(json, "name", name, sizeof(name)) ||
        !json_get_string(json, "host", host, sizeof(host))) {
        webapi_send_error(c, "INVALID_REQUEST", "Missing name or host");
        return;
    }

    if (!extendhost(host, buf, MAX_LEN)) {
        webapi_send_error(c, "INVALID_HOST", "Nieprawidłowy host");
        return;
    }

    HANDLE *h = userlist.findHandle(name);
    if (!h) {
        webapi_send_error(c, "INVALID_USER", "Nieprawidłowy użytkownik");
        return;
    }

    if (!userlist.hasWriteAccess(c, name)) {
        webapi_send_error(c, "NO_PERMISSION", "Brak uprawnień");
        return;
    }

    if (userlist.addHost(h, buf, c->name, NOW) == -1) {
        webapi_send_error(c, "HOST_EXISTS", "Host już istnieje");
        return;
    }

    net.send(HAS_B, "%s %s %s", S_ADDHOST, name, buf);
    userlist.updated();

    JsonResponse r;
    r.start("add_host_ok");
    r.add_string("name", name);
    r.add_string("host", buf);
    webapi_send(c, r.finish());
}

/*
 * CRUD: Delete host
 */
static void webapi_handle_del_host(inetconn *c, const char *json)
{
    char name[MAX_LEN], host[MAX_LEN];

    if (!json_get_string(json, "name", name, sizeof(name)) ||
        !json_get_string(json, "host", host, sizeof(host))) {
        webapi_send_error(c, "INVALID_REQUEST", "Missing name or host");
        return;
    }

    HANDLE *h = userlist.findHandle(name);
    if (!h) {
        webapi_send_error(c, "INVALID_USER", "Nieprawidłowy użytkownik");
        return;
    }

    if (!userlist.hasWriteAccess(c, name)) {
        webapi_send_error(c, "NO_PERMISSION", "Brak uprawnień");
        return;
    }

    int n = userlist.findHost(h, host);
    if (n == -1) {
        webapi_send_error(c, "INVALID_HOST", "Host nie istnieje");
        return;
    }

    net.send(HAS_B, "%s %s %s", S_RMHOST, name, h->host[n]);
    userlist.removeHost(h, host);
    userlist.updated();

    JsonResponse r;
    r.start("del_host_ok");
    r.add_string("name", name);
    r.add_string("host", host);
    webapi_send(c, r.finish());
}

/*
 * CRUD: Add bot
 */
static void webapi_handle_add_bot(inetconn *c, const char *json)
{
    char name[MAX_LEN], ip[MAX_LEN];

    if (!json_get_string(json, "name", name, sizeof(name)) ||
        !json_get_string(json, "ip", ip, sizeof(ip))) {
        webapi_send_error(c, "INVALID_REQUEST", "Missing name or ip");
        return;
    }

    if (!(c->handle->flags[GLOBAL] & HAS_S)) {
        webapi_send_error(c, "NO_PERMISSION", "Brak uprawnień");
        return;
    }

    if (!isRealStr(name)) {
        webapi_send_error(c, "INVALID_NAME", "Nieprawidłowa nazwa");
        return;
    }

    if (strlen(name) > MAX_HANDLE_LEN) {
        webapi_send_error(c, "NAME_TOO_LONG", "Nazwa za długa");
        return;
    }

    if (!isValidIp(ip)) {
        webapi_send_error(c, "INVALID_IP", "Nieprawidłowy adres IP");
        return;
    }

    HANDLE *h = userlist.addHandle(name, inet_addr("1.1.1.1"), B_FLAGS, 0, 0, c->name);
    if (!h) {
        webapi_send_error(c, "BOT_EXISTS", "Bot już istnieje");
        return;
    }

    h->addr->add(ip);
    net.send(HAS_B, "%s %s %s %s", S_ADDBOT, name, h->creation->print(), "1.1.1.1");
    net.send(HAS_B, "%s %s %s", S_ADDADDR, name, ip);
    userlist.SN++;
    userlist.updated();

    JsonResponse r;
    r.start("add_bot_ok");
    r.add_string("name", name);
    webapi_send(c, r.finish());
}

/*
 * CRUD: Delete bot
 */
static void webapi_handle_del_bot(inetconn *c, const char *json)
{
    char name[MAX_LEN];

    if (!json_get_string(json, "name", name, sizeof(name))) {
        webapi_send_error(c, "INVALID_REQUEST", "Missing name");
        return;
    }

    if (!(c->handle->flags[GLOBAL] & HAS_S)) {
        webapi_send_error(c, "NO_PERMISSION", "Brak uprawnień");
        return;
    }

    int n = userlist.removeHandle(name);
    if (n == 1) {
        net.send(HAS_B, "%s %s", S_RMUSER, name);
        userlist.updated();

        JsonResponse r;
        r.start("del_bot_ok");
        r.add_string("name", name);
        webapi_send(c, r.finish());
    } else if (n == -1) {
        webapi_send_error(c, "IMMORTAL_BOT", "Bot jest nieśmiertelny");
    } else {
        webapi_send_error(c, "INVALID_BOT", "Nieprawidłowy bot");
    }
}

/*
 * CRUD: Add channel
 */
static void webapi_handle_add_chan(inetconn *c, const char *json)
{
    char channel[MAX_LEN], key[MAX_LEN];

    if (!json_get_string(json, "channel", channel, sizeof(channel))) {
        webapi_send_error(c, "INVALID_REQUEST", "Missing channel");
        return;
    }

    if (!(c->handle->flags[GLOBAL] & HAS_S)) {
        webapi_send_error(c, "NO_PERMISSION", "Brak uprawnień");
        return;
    }

    if (!chan::valid(channel)) {
        webapi_send_error(c, "INVALID_CHANNEL", "Nieprawidłowy kanał");
        return;
    }

    if (!json_get_string(json, "key", key, sizeof(key))) {
        key[0] = '\0';
    }

    // Check if channel already exists
    bool alreadyAdded = (userlist.findChannel(channel) != -1);

    // Add channel with +P flag (permanent)
    int n = userlist.addChannel(channel, key, "P");
    if (n < 0) {
        webapi_send_error(c, "CHANNEL_FULL", "Lista kanałów jest pełna");
        return;
    }

    // If new, copy default settings
    if (!alreadyAdded) {
        *userlist.chanlist[n].chset = *userlist.dset;
    }

    // Notify partyline and bots
    net.send(HAS_N, "# %s # +chan %s %s", c->name, channel, key);
    net.send(HAS_B, "%s %s %s %s %s", S_ADDCHAN, "P", channel, key, "0");

    JsonResponse r;
    r.start("add_chan_ok");
    r.add_string("channel", channel);
    webapi_send(c, r.finish());
}

/*
 * CRUD: Delete channel
 */
static void webapi_handle_del_chan(inetconn *c, const char *json)
{
    char channel[MAX_LEN];

    if (!json_get_string(json, "channel", channel, sizeof(channel))) {
        webapi_send_error(c, "INVALID_REQUEST", "Missing channel");
        return;
    }

    if (!(c->handle->flags[GLOBAL] & HAS_S)) {
        webapi_send_error(c, "NO_PERMISSION", "Brak uprawnień");
        return;
    }

    if (!userlist.removeChannel(channel, channel)) {
        webapi_send_error(c, "INVALID_CHANNEL", "Nieprawidłowy kanał");
        return;
    }

    net.send(HAS_B, "%s %s", S_RMCHAN, channel);
    net.irc.send("PART %s :%s", channel, (const char *) set.PARTREASON);
    userlist.updated();

    JsonResponse r;
    r.start("del_chan_ok");
    r.add_string("channel", channel);
    webapi_send(c, r.finish());
}

/*
 * CRUD: Set chanset
 */
static void webapi_handle_set_chanset(inetconn *c, const char *json)
{
    char channel[MAX_LEN], var[MAX_LEN], value[MAX_LEN];

    if (!json_get_string(json, "channel", channel, sizeof(channel)) ||
        !json_get_string(json, "var", var, sizeof(var)) ||
        !json_get_string(json, "value", value, sizeof(value))) {
        webapi_send_error(c, "INVALID_REQUEST", "Missing channel, var or value");
        return;
    }

    int i = userlist.findChannel(channel);
    if (i == -1) {
        webapi_send_error(c, "INVALID_CHANNEL", "Nieprawidłowy kanał");
        return;
    }

    // Check permission - +N global or +N on channel
    if (!(c->handle->flags[GLOBAL] & HAS_N) && !(c->handle->flags[i] & HAS_N)) {
        webapi_send_error(c, "NO_PERMISSION", "Brak uprawnień");
        return;
    }

    if (!userlist.chanlist[i].chset->parseUser(c->name, var, value, channel, "chset")) {
        webapi_send_error(c, "INVALID_SETTING", "Nieprawidłowe ustawienie");
        return;
    }

    net.send(HAS_B, "%s %s %s %s", S_CHSET, channel, var, userlist.chanlist[i].chset->getValue(var));
    userlist.updated();

    JsonResponse r;
    r.start("set_chanset_ok");
    r.add_string("channel", channel);
    r.add_string("var", var);
    r.add_string("value", userlist.chanlist[i].chset->getValue(var));
    webapi_send(c, r.finish());
}

/*
 * CRUD: Add protlist entry (ban/stick/exempt/invite/reop)
 */
static void webapi_handle_add_protlist(inetconn *c, const char *json)
{
    char list_type[32], channel[MAX_LEN], mask[MAX_LEN], reason[MAX_LEN], buf[MAX_LEN];
    int expires = 0;

    if (!json_get_string(json, "list_type", list_type, sizeof(list_type)) ||
        !json_get_string(json, "mask", mask, sizeof(mask))) {
        webapi_send_error(c, "INVALID_REQUEST", "Missing list_type or mask");
        return;
    }

    json_get_string(json, "channel", channel, sizeof(channel));
    json_get_string(json, "reason", reason, sizeof(reason));

    // Parse expires
    char expires_str[32];
    if (json_get_string(json, "expires", expires_str, sizeof(expires_str))) {
        expires = atoi(expires_str);
        if (expires > 0) expires += NOW;
    }

    // Determine protlist type
    int type;
    bool stick = false;
    const char *botnet_cmd;

    if (!strcmp(list_type, "ban")) {
        type = BAN;
        botnet_cmd = S_ADDBAN;
    } else if (!strcmp(list_type, "stick")) {
        type = BAN;
        stick = true;
        botnet_cmd = S_ADDSTICK;
    } else if (!strcmp(list_type, "exempt")) {
        type = EXEMPT;
        botnet_cmd = S_ADDEXEMPT;
    } else if (!strcmp(list_type, "invite")) {
        type = INVITE;
        botnet_cmd = S_ADDINVITE;
    } else if (!strcmp(list_type, "reop")) {
        type = REOP;
        botnet_cmd = S_ADDREOP;
    } else {
        webapi_send_error(c, "INVALID_TYPE", "Nieprawidłowy typ listy");
        return;
    }

    // Validate and extend mask
    if (!extendhost(mask, buf, MAX_LEN)) {
        webapi_send_error(c, "INVALID_MASK", "Nieprawidłowa maska");
        return;
    }

    if (!strcmp(buf, "*!*@*")) {
        webapi_send_error(c, "INVALID_MASK", "Maska zbyt ogólna");
        return;
    }

    // Determine protlist (global or channel)
    protmodelist *plist;
    int chan_idx = GLOBAL;

    if (*channel && chan::valid(channel)) {
        chan_idx = userlist.findChannel(channel);
        if (chan_idx == -1) {
            webapi_send_error(c, "INVALID_CHANNEL", "Nieprawidłowy kanał");
            return;
        }
        plist = userlist.chanlist[chan_idx].protlist[type];
    } else {
        plist = userlist.protlist[type];
    }

    // Check permission
    if (!(c->handle->flags[GLOBAL] & HAS_N) &&
        (chan_idx == GLOBAL || !(c->handle->flags[chan_idx] & HAS_N))) {
        webapi_send_error(c, "NO_PERMISSION", "Brak uprawnień");
        return;
    }

    // Check for conflicts
    protmodelist::entry *conflict = plist->conflicts(buf);
    if (conflict) {
        webapi_send_error(c, "MASK_CONFLICT", "Konflikt z istniejącą maską");
        return;
    }

    // Add entry
    protmodelist::entry *e = plist->add(buf, c->handle->name, NOW, expires, reason, stick);

    net.send(HAS_B, "%s %s %s %s %s %d %s", botnet_cmd,
             *channel ? channel : "*", e->mask, e->by, " 0 ", e->expires, e->reason ? e->reason : "");

    userlist.updated();

    // Apply ban if applicable
    if (type == BAN) {
        if (*channel) {
            chan *ch = ME.findChannel(channel);
            if (ch) ch->applyBan(e);
        } else {
            chan *ch;
            foreachSyncedChannel(ch)
                ch->applyBan(e);
        }
    }

    JsonResponse r;
    r.start("add_protlist_ok");
    r.add_string("type", list_type);
    r.add_string("mask", buf);
    webapi_send(c, r.finish());
}

/*
 * CRUD: Delete protlist entry
 */
static void webapi_handle_del_protlist(inetconn *c, const char *json)
{
    char list_type[32], channel[MAX_LEN], mask[MAX_LEN];

    if (!json_get_string(json, "list_type", list_type, sizeof(list_type)) ||
        !json_get_string(json, "mask", mask, sizeof(mask))) {
        webapi_send_error(c, "INVALID_REQUEST", "Missing list_type or mask");
        return;
    }

    json_get_string(json, "channel", channel, sizeof(channel));

    // Determine protlist type
    int type;
    const char *botnet_cmd;

    if (!strcmp(list_type, "ban") || !strcmp(list_type, "stick")) {
        type = BAN;
        botnet_cmd = S_RMBAN;
    } else if (!strcmp(list_type, "exempt")) {
        type = EXEMPT;
        botnet_cmd = S_RMEXEMPT;
    } else if (!strcmp(list_type, "invite")) {
        type = INVITE;
        botnet_cmd = S_RMINVITE;
    } else if (!strcmp(list_type, "reop")) {
        type = REOP;
        botnet_cmd = S_RMREOP;
    } else {
        webapi_send_error(c, "INVALID_TYPE", "Nieprawidłowy typ listy");
        return;
    }

    // Determine protlist (global or channel)
    protmodelist *plist;
    int chan_idx = GLOBAL;

    if (*channel && chan::valid(channel)) {
        chan_idx = userlist.findChannel(channel);
        if (chan_idx == -1) {
            webapi_send_error(c, "INVALID_CHANNEL", "Nieprawidłowy kanał");
            return;
        }
        plist = userlist.chanlist[chan_idx].protlist[type];
    } else {
        plist = userlist.protlist[type];
    }

    // Check permission
    if (!(c->handle->flags[GLOBAL] & HAS_N) &&
        (chan_idx == GLOBAL || !(c->handle->flags[chan_idx] & HAS_N))) {
        webapi_send_error(c, "NO_PERMISSION", "Brak uprawnień");
        return;
    }

    // Find and remove entry
    protmodelist::entry *e = plist->find(mask);
    if (!e) {
        webapi_send_error(c, "NOT_FOUND", "Wpis nie istnieje");
        return;
    }

    net.send(HAS_B, "%s %s %s", botnet_cmd, mask, *channel ? channel : "*");

    // Remove from IRC if it's a ban
    if (type == BAN) {
        if (*channel) {
            chan *ch = ME.findChannel(channel);
            if (ch) ch->modeQ[PRIO_LOW].add(NOW, "-b", mask);
        } else {
            chan *ch;
            foreachSyncedChannel(ch)
                ch->modeQ[PRIO_LOW].add(NOW, "-b", mask);
        }
    }

    plist->remove(mask);
    userlist.updated();

    JsonResponse r;
    r.start("del_protlist_ok");
    r.add_string("type", list_type);
    r.add_string("mask", mask);
    webapi_send(c, r.finish());
}

/*
 * Main parser function - called from main loop
 */

void parse_webapi(inetconn *c, char *data)
{
    char type[64];

    fprintf(stderr, "[WEBAPI] parse_webapi called, data=%s\n", data ? data : "NULL");
    fflush(stderr);

    if (!data || *data == '\0')
        return;

    // Must be valid JSON starting with {
    if (data[0] != '{') {
        webapi_send_error(c, "PARSE_ERROR", "Invalid JSON");
        return;
    }

    if (!json_get_type(data, type, sizeof(type))) {
        webapi_send_error(c, "PARSE_ERROR", "Missing type field");
        return;
    }

    /* NOT REGISTERED - handle auth */
    if (!(c->status & STATUS_REGISTERED)) {
        char client_ip_buf[64];
        const char *client_ip = webapi_get_real_ip(c, data, client_ip_buf, sizeof(client_ip_buf));

        // Check if IP is blocked
        if (webapi_is_ip_blocked(client_ip)) {
            int remaining = webapi_get_block_remaining(client_ip);
            char msg[128];
            snprintf(msg, sizeof(msg), "IP blocked. Try again in %d minutes.", (remaining / 60) + 1);
            webapi_send_auth_fail(c, msg);
            return;
        }

        // Handle token-based authentication (for reconnects)
        if (!strcmp(type, "auth_token")) {
            char token[128];

            if (!json_get_string(data, "token", token, sizeof(token))) {
                webapi_send_auth_fail(c, "Missing token");
                return;
            }

            std::string handle = webapi_validate_session(token, client_ip);
            if (!handle.empty()) {
                HANDLE *h = userlist.findHandle(handle.c_str());
                if (h && (h->flags[GLOBAL] & HAS_P)) {
                    // Token valid - authenticate
                    c->status |= STATUS_REGISTERED;
                    c->handle = h;
                    mem_strcpy(c->name, h->name);
                    c->killTime = 0;

                    // Touch session to update last_used
                    webapi_touch_session(token);

                    webapi_send_auth_ok(c, token);
                    webapi_send_init(c);
                    webapi_broadcast_user_join(c->name);
                    return;
                }
            }

            // Token invalid or expired
            webapi_destroy_session(token);
            webapi_send_auth_fail(c, "Invalid or expired token");
            return;
        }

        // Handle password-based authentication
        if (!strcmp(type, "auth")) {
            // Check rate limit
            if (!webapi_check_rate_limit(client_ip)) {
                webapi_send_auth_fail(c, "Too many login attempts. Please wait.");
                return;
            }

            char handle[MAX_LEN], password[MAX_LEN];

            if (!json_get_string(data, "handle", handle, sizeof(handle)) ||
                !json_get_string(data, "password", password, sizeof(password))) {
                webapi_send_auth_fail(c, "Missing handle or password");
                return;
            }

            HANDLE *h = userlist.checkPartylinePass(handle, password, HAS_P);

            if (h) {
                // Check IP if required
                if (h->addr && h->addr->data.entries() && !h->addr->match(client_ip)) {
                    webapi_record_login_attempt(client_ip, false);
                    webapi_send_auth_fail(c, "Invalid IP address");
                    return;
                }

                // Successful login
                webapi_record_login_attempt(client_ip, true);

                c->status |= STATUS_REGISTERED;
                c->handle = h;
                mem_strcpy(c->name, h->name);
                c->killTime = 0;

                // Create session token
                std::string token = webapi_create_session(h->name, client_ip);

                webapi_send_auth_ok(c, token.c_str());
                webapi_send_init(c);

                // Notify other users
                webapi_broadcast_user_join(c->name);

                ignore.removeHit(c->getPeerIp4());
                return;
            } else {
                // Failed login
                webapi_record_login_attempt(client_ip, false);

                HANDLE *h_check = userlist.findHandle(handle);
                if (h_check) {
                    if (!(h_check->flags[GLOBAL] & HAS_P))
                        webapi_send_auth_fail(c, "No partyline privileges");
                    else
                        webapi_send_auth_fail(c, "Invalid password");
                } else {
                    webapi_send_auth_fail(c, "Invalid handle");
                }
                return;
            }
        }

        // Handle logout (invalidate token)
        if (!strcmp(type, "logout")) {
            char token[128];
            if (json_get_string(data, "token", token, sizeof(token))) {
                webapi_destroy_session(token);
            }
            webapi_send(c, "{\"type\":\"logout_ok\"}");
            return;
        }

        webapi_send_error(c, "AUTH_REQUIRED", "Must authenticate first");
        return;
    }

    /* REGISTERED - handle commands */

    if (!strcmp(type, "ping")) {
        webapi_send(c, "{\"type\":\"pong\"}");
        return;
    }

    if (!strcmp(type, "command")) {
        webapi_handle_cmd(c, data);
        return;
    }

    if (!strcmp(type, "cmd")) {
        webapi_handle_cmd(c, data);
        return;
    }

    if (!strcmp(type, "chat")) {
        webapi_handle_chat(c, data);
        return;
    }

    if (!strcmp(type, "list_channels")) {
        webapi_handle_list_channels(c);
        return;
    }

    if (!strcmp(type, "list_users")) {
        webapi_handle_list_users(c);
        return;
    }

    if (!strcmp(type, "get_user")) {
        webapi_handle_get_user(c, data);
        return;
    }

    if (!strcmp(type, "list_bots")) {
        webapi_handle_list_bots(c);
        return;
    }

    if (!strcmp(type, "get_channel")) {
        webapi_handle_get_channel(c, data);
        return;
    }

    /* CRUD - Users */
    if (!strcmp(type, "add_user")) {
        webapi_handle_add_user(c, data);
        return;
    }

    if (!strcmp(type, "del_user")) {
        webapi_handle_del_user(c, data);
        return;
    }

    if (!strcmp(type, "set_user_flags")) {
        webapi_handle_set_user_flags(c, data);
        return;
    }

    if (!strcmp(type, "set_user_pass")) {
        webapi_handle_set_user_pass(c, data);
        return;
    }

    if (!strcmp(type, "add_host")) {
        webapi_handle_add_host(c, data);
        return;
    }

    if (!strcmp(type, "del_host")) {
        webapi_handle_del_host(c, data);
        return;
    }

    /* CRUD - Bots */
    if (!strcmp(type, "add_bot")) {
        webapi_handle_add_bot(c, data);
        return;
    }

    if (!strcmp(type, "del_bot")) {
        webapi_handle_del_bot(c, data);
        return;
    }

    /* CRUD - Channels */
    if (!strcmp(type, "add_chan")) {
        webapi_handle_add_chan(c, data);
        return;
    }

    if (!strcmp(type, "del_chan")) {
        webapi_handle_del_chan(c, data);
        return;
    }

    if (!strcmp(type, "set_chanset")) {
        webapi_handle_set_chanset(c, data);
        return;
    }

    /* CRUD - Protlists */
    if (!strcmp(type, "add_protlist")) {
        webapi_handle_add_protlist(c, data);
        return;
    }

    if (!strcmp(type, "del_protlist")) {
        webapi_handle_del_protlist(c, data);
        return;
    }

    webapi_send_error(c, "UNKNOWN_TYPE", "Unknown message type");
}

/*
 * Broadcast functions - send events to all webapi connections
 */

void webapi_broadcast(const char *json)
{
    char buf[MAX_LEN * 2];
    int len = snprintf(buf, sizeof(buf), "%s\n", json);

    for (int i = 0; i < net.max_conns; ++i) {
        if (net.conn[i].fd &&
            (net.conn[i].status & STATUS_WEBAPI) &&
            (net.conn[i].status & STATUS_REGISTERED)) {
            write(net.conn[i].fd, buf, len);
        }
    }
}

void webapi_broadcast_filtered(const char *json, int required_flags)
{
    char buf[MAX_LEN * 2];
    int len = snprintf(buf, sizeof(buf), "%s\n", json);

    for (int i = 0; i < net.max_conns; ++i) {
        if (net.conn[i].fd &&
            (net.conn[i].status & STATUS_WEBAPI) &&
            (net.conn[i].status & STATUS_REGISTERED) &&
            (net.conn[i].handle->flags[GLOBAL] & required_flags)) {
            write(net.conn[i].fd, buf, len);
        }
    }
}

void webapi_broadcast_bot_join(const char *name, const char *nick, const char *server)
{
    JsonResponse r;
    r.start("bot_join");
    r.add_string("name", name);
    r.add_string("nick", nick ? nick : "");
    r.add_string("server", server ? server : "");
    webapi_broadcast(r.finish());
}

void webapi_broadcast_bot_quit(const char *name, const char *reason)
{
    JsonResponse r;
    r.start("bot_quit");
    r.add_string("name", name);
    r.add_string("reason", reason ? reason : "");
    webapi_broadcast(r.finish());
}

void webapi_broadcast_bot_nick(const char *name, const char *nick, const char *server)
{
    JsonResponse r;
    r.start("bot_nick");
    r.add_string("name", name);
    r.add_string("nick", nick);
    r.add_string("server", server ? server : "");
    webapi_broadcast(r.finish());
}

void webapi_broadcast_user_join(const char *handle)
{
    JsonResponse r;
    r.start("user_join");
    r.add_string("handle", handle);
    webapi_broadcast(r.finish());
}

void webapi_broadcast_user_quit(const char *handle)
{
    JsonResponse r;
    r.start("user_quit");
    r.add_string("handle", handle);
    webapi_broadcast(r.finish());
}

void webapi_broadcast_chat(const char *handle, const char *text)
{
    JsonResponse r;
    r.start("user_chat");
    r.add_string("handle", handle);
    r.add_string("text", text);
    webapi_broadcast(r.finish());
}

/*
 * Live update broadcasts - notify clients of data changes
 */

void webapi_broadcast_user_changed(const char *handle)
{
    JsonResponse r;
    r.start("user_changed");
    r.add_string("handle", handle);
    webapi_broadcast(r.finish());
}

void webapi_broadcast_channel_changed(const char *channel)
{
    JsonResponse r;
    r.start("channel_changed");
    r.add_string("channel", channel);
    webapi_broadcast(r.finish());
}

void webapi_broadcast_protlist_changed(const char *channel, const char *list_type)
{
    JsonResponse r;
    r.start("protlist_changed");
    r.add_string("channel", channel ? channel : "*");
    r.add_string("type", list_type);
    webapi_broadcast(r.finish());
}

void webapi_broadcast_userlist_changed()
{
    JsonResponse r;
    r.start("userlist_changed");
    webapi_broadcast(r.finish());
}

/*
 * Check if there are any webapi connections
 */

bool webapi_has_connections()
{
    for (int i = 0; i < net.max_conns; ++i) {
        if (net.conn[i].fd && (net.conn[i].status & STATUS_WEBAPI)) {
            return true;
        }
    }
    return false;
}

#endif /* HAVE_WEBAPI */
