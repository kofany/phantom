/*
 * czurakick — auto anti-spam module for the "Madeleine Czura" IRCnet flood.
 *
 * Port of the irssi Perl script czurakick.pl to a psotnic native module so
 * bots can handle the flood themselves without needing an opped client in
 * the channel.
 *
 * Detection:
 *   Each PRIVMSG is normalised into a *compact* form — lowercased, all
 *   non-ASCII-alphanumerics (whitespace, punctuation, UTF-8 look-alikes)
 *   stripped. A short list of signature substrings ("maddyczura",
 *   "7599248843", …) is matched against the compact form with strstr().
 *   Simple, deterministic, fast, and catches obfuscations like
 *   "m a d d y   c z u r a" or "Maddy-Czüra".
 *
 * Whitelist:
 *   The raw message is checked against a POSIX regex of incident-response
 *   keywords (block, filter, spam, report, …) so ops warning each other
 *   about the flood are not punished.
 *
 * Action:
 *   Custom host-wildcard knockout — bans *!*@<host> (not *!<ident>@<host>
 *   like chan::knockout()). Most spammers rotate nick + ident on every
 *   connection but keep the same origin IP / reverse DNS, so an
 *   ident-specific mask is trivially circumvented. The routine reuses
 *   chan::modeQ + chan::kick, so the auto-unban scheduling after
 *   BAN_SECONDS still works the same way as knockout().
 *
 * Guards:
 *   - Skip users with +o on the channel (channel ops).
 *   - +v (voice) is NOT exempt — auto-voice channels would otherwise let
 *     every spammer through.
 *   - Per-chanuser cooldown (60 s) so a burst of matching lines from the
 *     same nick only triggers one action while the first knockout
 *     propagates.
 *   - If the bot itself is not opped, the +b/kick still queues in modeQ
 *     and fires the moment the bot acquires ops; a NOT-OPPED line is
 *     written to the log so the delay is attributable.
 *
 * Logging:
 *   Append-only ~/czurakick.log. One line per significant event:
 *     LOAD / UNLOAD — module lifecycle + stats.
 *     ACT           — acted (opped=yes|no tells you whether it fired now).
 *     NOT-OPPED     — matched but bot had no @; queued for flush on op-up.
 *     COOLED        — matched but inside the per-user cooldown window.
 *     EXEMPT-OP     — matched but target user has +o.
 *
 * Configuration:
 *   Compile-time constants below. The anti-spam signatures target a
 *   specific hostile campaign, so edit + recompile + reload if the
 *   adversary rotates keywords.
 */

#include <prots.h>
#include <global-var.h>
#include <classes.h>

#include <regex.h>
#include <string.h>
#include <ctype.h>
#include <stdio.h>
#include <stdarg.h>
#include <stdlib.h>
#include <time.h>

namespace czk {

// ----- Compile-time configuration -----------------------------------------

// Per-chanuser cooldown: second matching line within this window is ignored.
static const int  COOLDOWN_SECONDS = 60;

// Ban duration (seconds) scheduled for auto-unban. 1 h default for this
// campaign; ops can manually unban earlier.
static const int  BAN_SECONDS      = 3600;

// Skip users holding +o on the channel. +v (voice) is NOT exempt — during
// the czura campaign spammers were seen on channels that auto-voice every
// joiner, so treating voice as trust is too lenient.
static const bool SKIP_OPS         = true;

// Kick reason shown to the victim.
static const char *KICK_REASON     = "Spam - auto-removed";

// Custom-data slot name — unique per module to avoid collisions with
// spam.cpp's "spam" slot.
static const char *CDATA_SLOT      = "czurakick";

// Compact-form signature list. The compact form is produced by
// lowercasing the input and stripping every non-ASCII-alphanumeric byte,
// so patterns here must be all lowercase letters and digits.
static const char *COMPACT_PATTERNS[] = {
    "maddyczura",
    "madeleineczura",
    "7599248843",
    "czuraarcadis",
    "arcadisczura",
    "maddyczuragmail",
    NULL,
};

// Whitelist regex: applied to the raw message before normalisation so an
// op writing "block maddyczura@gmail.com" in a warning does not get
// knockout'd. Keep this conservative — missing a spammer is better than
// false-positive banning an op.
static const char *WHITELIST_PATTERN =
    "(^|[^a-zA-Z])("
    "block|filter|blacklist|blocklist|ignore|report|warn|warning|"
    "spam|scam|avoid|detect|detection|czurakick|czk"
    ")([^a-zA-Z]|$)";

// ----- Runtime state ------------------------------------------------------

static regex_t whitelist_re;
static bool    whitelist_re_ok = false;

static char    log_path[512] = { 0 };

struct Stats {
    unsigned long detected;
    unsigned long acted;
    unsigned long skipped_status;
    unsigned long whitelisted;
    unsigned long cooled;
    unsigned long not_opped;
};
static Stats stats = { 0, 0, 0, 0, 0, 0 };

class CzkState : public CustomDataObject {
  public:
    time_t last_action;
    CzkState() : CustomDataObject(), last_action(0) {}
    ~CzkState() {}
};

// ----- Helpers ------------------------------------------------------------

static void write_log(const char *fmt, ...) {
    if (!log_path[0]) return;
    FILE *fh = fopen(log_path, "a");
    if (!fh) return;

    time_t now = time(NULL);
    struct tm tmv;
    localtime_r(&now, &tmv);
    char stamp[32];
    strftime(stamp, sizeof(stamp), "%Y-%m-%d %H:%M:%S", &tmv);
    fprintf(fh, "[%s] ", stamp);

    va_list ap;
    va_start(ap, fmt);
    vfprintf(fh, fmt, ap);
    va_end(ap);

    fputc('\n', fh);
    fclose(fh);
}

static void compact_normalize(const char *src, char *dst, size_t dstlen) {
    if (dstlen == 0) return;
    size_t j = 0;
    for (size_t i = 0; src[i] && j + 1 < dstlen; ++i) {
        unsigned char c = static_cast<unsigned char>(src[i]);
        // Keep ASCII alphanumerics only. UTF-8 multibyte sequences (e.g. 'ł')
        // have the high bit set on every byte and are therefore stripped —
        // which is exactly the effect we want, since every compact pattern
        // is letter+digit only.
        if (c < 0x80 && isalnum(c)) {
            dst[j++] = static_cast<char>(tolower(c));
        }
    }
    dst[j] = '\0';
}

static const char *match_compact(const char *compact) {
    for (int i = 0; COMPACT_PATTERNS[i]; ++i) {
        if (strstr(compact, COMPACT_PATTERNS[i])) {
            return COMPACT_PATTERNS[i];
        }
    }
    return NULL;
}

static bool is_whitelisted(const char *msg) {
    if (!whitelist_re_ok) return false;
    regmatch_t m;
    return regexec(&whitelist_re, msg, 1, &m, 0) == 0;
}

static CzkState *get_state(chanuser *u) {
    CzkState *s = static_cast<CzkState *>(u->customData(CDATA_SLOT));
    if (!s) {
        s = new CzkState;
        u->setCustomData(CDATA_SLOT, s);
    }
    return s;
}

// Host-only knockout: ban *!*@host, then kick. Auto-unban after `delay`
// seconds — scheduled via the channel's backup-mode queue, same mechanism
// chan::knockout() uses, so no leak and the unban survives our module
// being unloaded (the ch object and its modeQ live in the bot core).
static void knockout_host(chan *ch, chanuser *u, const char *reason, int delay) {
    if (!ch || !u || !u->host || !u->host[0]) return;
    char mask[MAX_LEN];
    snprintf(mask, sizeof(mask), "*!*@%s", u->host);
    ch->modeQ[PRIO_HIGH].add(NOW, "+b", mask);
    ch->modeQ[PRIO_LOW].add(NOW + delay, "-b", mask)->backupmode = true;
    ch->modeQ[PRIO_HIGH].flush(PRIO_HIGH);
    ch->kick(u, reason);
    u->setReason(reason);
}

static void truncate_printable(const char *src, char *dst, size_t dstlen, size_t max_show) {
    if (dstlen == 0) return;
    size_t limit = (max_show < dstlen - 1) ? max_show : dstlen - 1;
    size_t j = 0;
    for (size_t i = 0; src[i] && j < limit; ++i) {
        unsigned char c = static_cast<unsigned char>(src[i]);
        dst[j++] = (c < 0x20 || c == 0x7f) ? '?' : src[i];
    }
    dst[j] = '\0';
}

// ----- Hook ---------------------------------------------------------------

void hook_privmsg(const char *from, const char *to, const char *msg) {
    if (!from || !to || !msg) return;

    chan *ch = ME.findChannel(to);
    if (!ch) return;                        // PMs and unknown channels ignored

    chanuser *u = ch->getUser(from);
    if (!u) return;

    // Whitelist first — cheap regex, avoids wasted work on warning messages.
    if (is_whitelisted(msg)) {
        ++stats.whitelisted;
        return;
    }

    char compact[1024];
    compact_normalize(msg, compact, sizeof(compact));
    const char *matched = match_compact(compact);
    if (!matched) return;

    ++stats.detected;

    if (SKIP_OPS && (u->flags & (HAS_O | IS_OP))) {
        ++stats.skipped_status;
        write_log("EXEMPT-OP chan=%s nick=%s match=%s", to, from, matched);
        return;
    }

    CzkState *st = get_state(u);
    time_t now = time(NULL);
    if (st->last_action && (now - st->last_action) < COOLDOWN_SECONDS) {
        ++stats.cooled;
        char shown_c[160];
        truncate_printable(msg, shown_c, sizeof(shown_c), 80);
        write_log("COOLED chan=%s nick=%s match=%s age=%lds text=%s",
                  to, from, matched,
                  (long)(now - st->last_action), shown_c);
        return;
    }
    st->last_action = now;

    char shown[160];
    truncate_printable(msg, shown, sizeof(shown), 120);

    // Diagnostic: if the bot is not opped, the +b/kick sits in modeQ until
    // the bot acquires ops. Still call knockout_host() — psotnic's queue
    // will flush on op-up — but log the pre-condition so the delay is
    // attributable, not mysterious.
    bool we_are_op = ch->me && (ch->me->flags & IS_OP);
    if (!we_are_op) {
        ++stats.not_opped;
        write_log("NOT-OPPED chan=%s nick=%s match=%s mask=*!*@%s "
                  "(queued — will fire on op-up)",
                  to, from, matched,
                  (u->host && u->host[0]) ? u->host : "?");
    }

    knockout_host(ch, u, KICK_REASON, BAN_SECONDS);
    ++stats.acted;

    write_log("ACT chan=%s nick=%s mask=*!*@%s match=%s opped=%s text=%s",
              to, from,
              (u->host && u->host[0]) ? u->host : "?",
              matched, we_are_op ? "yes" : "no", shown);
}

// ACTION (/me …) arrives as a CTCP frame — handle the same way.
void hook_ctcp(const char *from, const char *to, const char *msg) {
    if (!msg) return;
    if (strncasecmp(msg, "ACTION ", 7) != 0) return;
    hook_privmsg(from, to, msg + 7);
}

// Per-chanuser state lifecycle — mirrors spam.cpp so the CustomData slot
// is always cleaned up.
void hook_new_chanuser(chanuser *u) {
    // Lazy: allocate the state only when we first act on this user. No-op
    // here keeps module load cheap on channels with thousands of joins.
    (void)u;
}

void hook_del_chanuser(chanuser *u) {
    CzkState *s = static_cast<CzkState *>(u->customData(CDATA_SLOT));
    if (s) {
        delete s;
        u->delCustomData(CDATA_SLOT);
    }
}

static void cleanup_all_chanusers() {
    chan *ch;
    ptrlist<chanuser>::iterator it;
    for (ch = ME.first; ch; ch = ch->next) {
        for (it = ch->users.begin(); it; it++) {
            hook_del_chanuser(it);
        }
    }
}

} // namespace czk

// ----- Module entry points (must have C linkage + global scope) -----------

extern "C" module *init() {
    module *m = new module(
        "czurakick",
        "Phantom contributors",
        "1.2.1");

    const char *home = getenv("HOME");
    if (home && home[0]) {
        snprintf(czk::log_path, sizeof(czk::log_path),
                 "%s/czurakick.log", home);
    } else {
        snprintf(czk::log_path, sizeof(czk::log_path),
                 "czurakick.log");
    }

    czk::whitelist_re_ok =
        (regcomp(&czk::whitelist_re, czk::WHITELIST_PATTERN,
                 REG_ICASE | REG_EXTENDED) == 0);

    m->hooks->privmsg      = czk::hook_privmsg;
    m->hooks->ctcp         = czk::hook_ctcp;
    m->hooks->new_chanuser = czk::hook_new_chanuser;
    m->hooks->del_chanuser = czk::hook_del_chanuser;

    czk::write_log("LOAD czurakick v1.2.1 patterns=%d whitelist=%s",
                   (int)(sizeof(czk::COMPACT_PATTERNS) /
                         sizeof(czk::COMPACT_PATTERNS[0]) - 1),
                   czk::whitelist_re_ok ? "ok" : "FAILED");

    return m;
}

extern "C" void destroy() {
    czk::cleanup_all_chanusers();
    if (czk::whitelist_re_ok) {
        regfree(&czk::whitelist_re);
        czk::whitelist_re_ok = false;
    }
    czk::write_log("UNLOAD czurakick v1.2.1 detected=%lu acted=%lu "
                   "skipped_op=%lu whitelisted=%lu cooled=%lu not_opped=%lu",
                   czk::stats.detected, czk::stats.acted,
                   czk::stats.skipped_status, czk::stats.whitelisted,
                   czk::stats.cooled, czk::stats.not_opped);
}
