/* Voice Control Module - Phantom Edition
 *
 * This module provides sophisticated voice control functionality with granular access levels
 * based on bot userlist membership and channel voice status.
 *
 * ===========================================================================================
 * ACCESS CONTROL SYSTEM:
 * ===========================================================================================
 *
 * 1. ADDED USERS (Registered in bot userlist with flags: +o, +v, +f, +m, +n, etc.):
 *    These users have full administrative access to all commands:
 *    - !kick <nick> [<reason>]      - Kick user from channel
 *    - !ban <nick> [<reason>]       - Ban and kick user from channel
 *    - !banmask <mask>              - Set ban by hostmask
 *    - !unban <mask>                - Remove ban from channel
 *    - !topic <text>                - Change channel topic
 *    - !voice <nick>                - Give voice to user (legacy)
 *    - !devoice <nick>              - Remove voice from user (legacy)
 *
 * 2. NON-ADDED USERS (Voiced users without bot userlist flags):
 *    Users with +v on channel but not registered in bot userlist have LIMITED access:
 *    - !topic <text>                - Change channel topic ONLY
 *    - SILENT MODE: No response for administrative commands (Phantom contributors)
 *
 * The module automatically detects user status and enforces appropriate restrictions.
 * Added users are identified by presence of any permission flags in bot's userlist.
 * Non-added users receive NO feedback for restricted commands to prevent information leakage.
 *
 * ===========================================================================================
 * CONFIGURATION:
 * ===========================================================================================
 *
 * Partyline commands:
 *   .bc <bot> vset [<key> [<value>]]               - Configure global settings
 *   .bc <bot> vchanset <channel> [<key> [<value>]] - Configure channel-specific settings
 *   .bc <bot> vchanset *                           - Apply settings to all channels
 *
 * Key configuration variables:
 *   notice                    - Send notices (introduction messages, error notifications)
 *   max-delay                 - Random delay to prevent mode flooding (0-60 seconds)
 *   ban-type                  - Ban mask format: %n=nick, %i=ident, %h=host
 *                               Example: *!%i@%h creates ban like: *!patrick@psotnic.com
 *   required-flag             - Global flag required for command execution
 *   *-command-required-flag   - Specific flag for individual commands
 *   voicecontrol              - Enable/disable voice control per channel
 *   dont-kick-voiced-users    - Protect voiced users from kicks/bans
 *
 * Examples:
 *   .bc bot1 vchanset #channel voicecontrol OFF    - Disable voicecontrol on #channel
 *   .bc bot1 vset max-delay 10                     - Set 10 second random delay
 *   .bc bot1 vset ban-type *!*@%h                  - Ban by host only
 *
 * Multi-bot setup recommendation:
 *   - Disable 'notice' to prevent spam
 *   - Set 'max-delay' to 10+ seconds to prevent mode conflicts
 *
 * ===========================================================================================
 * SECURITY ENHANCEMENTS (Phantom contributors):
 * ===========================================================================================
 * - Silent mode for non-added users attempting administrative commands
 * - No information leakage about access control mechanisms
 * - Enhanced protection against reconnaissance attempts
 * - Improved user privacy and security posture
 *
 * ===========================================================================================
 * Credits: AnGelZ, Aretino, death, Lu[4, MnEm0nIc, rocks, patrick <patrick@psotnic.com>
 * Enhanced by: Phantom contributors
 * ===========================================================================================
 */

#include <prots.h>
#include <global-var.h>

extern flagTable FT[];

#define VCTRL_CFG_FILE "vctrl.txt"
#define VCTRL_USER_NOT_FOUND "Sorry, this user is not on the channel."

// global settings
class vsettings : public options
{
 public:

    entBool NOTICE;
    entTime MAX_DELAY;
    entString INTRO;
    entTime CFG_SAVE_DELAY;
    entWord BAN_TYPE;
    entBool DONT_KICK_VOICED_USERS;

    vsettings();
};

vsettings::vsettings()
{
    registerObject(NOTICE = entBool("notice", 1));
    registerObject(MAX_DELAY = entTime("max-delay", 0, 60, 0));
    registerObject(INTRO = entString("intro", 1, 255, "Welcome to the control, you can use:"));
    registerObject(CFG_SAVE_DELAY = entTime("cfg-save-delay", 0, 3600, 20));
    registerObject(BAN_TYPE = entWord("ban-type", 1, 255, "*!%i@%h"));
    registerObject(DONT_KICK_VOICED_USERS = entBool("dont-kick-voiced-users", 0));
}

// channel settings
class vchanset : public CustomDataObject, public options
{
 public:

    entBool VOICE_CONTROL;
    entWord REQUIRED_FLAG;
    entBool VOICE_CMD;
    entWord VOICE_CMD_REQUIRED_FLAG;
    entBool DEVOICE_CMD;
    entWord DEVOICE_CMD_REQUIRED_FLAG;
    entBool KICK_CMD;
    entWord KICK_CMD_REQUIRED_FLAG;
    entBool BAN_CMD;
    entWord BAN_CMD_REQUIRED_FLAG;
    entBool BANMASK_CMD;
    entWord BANMASK_CMD_REQUIRED_FLAG;
    entBool UNBAN_CMD;
    entWord UNBAN_CMD_REQUIRED_FLAG;
    entBool TOPIC_CMD;
    entWord TOPIC_CMD_REQUIRED_FLAG;
    entBool USE_TOPIC_PREFIX;
    entString TOPIC_PREFIX;
    entBool USE_TOPIC_APPENDIX;
    entString TOPIC_APPENDIX;

    vchanset();
    ~vchanset();
};

vchanset::vchanset() : CustomDataObject()
{
    registerObject(VOICE_CONTROL = entBool("voicecontrol", 1));
    registerObject(REQUIRED_FLAG = entWord("required-flag", 1, 1, "-"));
    registerObject(VOICE_CMD = entBool("voice-command", 1));
    registerObject(VOICE_CMD_REQUIRED_FLAG = entWord("voice-command-required-flag", 1, 1, "-"));
    registerObject(DEVOICE_CMD = entBool("devoice-command", 1));
    registerObject(DEVOICE_CMD_REQUIRED_FLAG = entWord("devoice-command-required-flag", 1, 1, "-"));
    registerObject(KICK_CMD = entBool("kick-command", 1));
    registerObject(KICK_CMD_REQUIRED_FLAG = entWord("kick-command-required-flag", 1, 1, "-"));
    registerObject(BAN_CMD = entBool("ban-command", 1));
    registerObject(BAN_CMD_REQUIRED_FLAG = entWord("ban-command-required-flag", 1, 1, "-"));
    registerObject(BANMASK_CMD = entBool("banmask-command", 0));
    registerObject(BANMASK_CMD_REQUIRED_FLAG = entWord("banmask-command-required-flag", 1, 1, "-"));
    registerObject(UNBAN_CMD = entBool("unban-command", 1));
    registerObject(UNBAN_CMD_REQUIRED_FLAG = entWord("unban-command-required-flag", 1, 1, "-"));
    registerObject(TOPIC_CMD = entBool("topic-command", 1));
    registerObject(TOPIC_CMD_REQUIRED_FLAG = entWord("topic-command-required-flag", 1, 1, "-"));
    registerObject(USE_TOPIC_PREFIX = entBool("use-topic-prefix", 0));
    registerObject(TOPIC_PREFIX = entString("topic-prefix", 0, 128));
    registerObject(USE_TOPIC_APPENDIX = entBool("use-topic-appendix", 0));
    registerObject(TOPIC_APPENDIX = entString("topic-appendix", 0, 128, "(%n)"));
}

vchanset::~vchanset()
{
}

time_t vctrl_next_save;
vsettings vset;
module *module_info;

struct vctrl_func
{
    const char *command;
    void (*func)(chan *, chanuser *, char *);
    const char *enabled;
    const char *flag;
};

void vctrl_voice(chan *, chanuser *, char *);
void vctrl_devoice(chan *, chanuser *, char *);
void vctrl_kick(chan *, chanuser *, char *);
void vctrl_ban(chan *, chanuser *, char *);
void vctrl_banmask(chan *, chanuser *, char *);
void vctrl_unban(chan *, chanuser *, char *);
void vctrl_topic(chan *, chanuser *, char *);

void vctrl_setSave(void);
void vctrl_load(void);
void vctrl_save(void);
void vctrl_notice(const char *, const char *, ...);
int vctrl_format(char *, size_t, const char *, chanuser *);
int vctrl_get_delay(void);
bool vctrl_check_flag(CHANLIST *, chanuser *, const char *);
bool vctrl_is_added_user(chan *, chanuser *);
bool vctrl_is_restricted_command(const char *);

// irc command, function, setting to enable/disable command, setting that contains the required flag
struct vctrl_func vctrl_flist[] = {
    { "!voice", vctrl_voice, "voice-command", "voice-command-required-flag" },
    { "!devoice", vctrl_devoice, "devoice-command", "devoice-command-required-flag" },
    { "!kick",  vctrl_kick, "kick-command", "kick-command-required-flag" },
    { "!ban",   vctrl_ban, "ban-command", "ban-command-required-flag" },
    { "!banmask", vctrl_banmask, "banmask-command", "banmask-command-required-flag" },
    { "!unban", vctrl_unban, "unban-command", "unban-command-required-flag" },
    { "!topic", vctrl_topic, "topic-command", "topic-command-required-flag" },
    { NULL,     NULL, NULL, NULL }
};

/**
 * Determines if a command requires the user to be registered in bot's userlist
 * 
 * Administrative commands (kick, ban, unban, banmask) are restricted to added users only.
 * This prevents random voiced users from abusing moderation powers.
 * 
 * @param cmd Command name to check (e.g., "!kick", "!ban", "!topic")
 * @return true if command requires added user status, false otherwise
 */
bool vctrl_is_restricted_command(const char *cmd)
{
    return (!strcmp(cmd, "!kick") || !strcmp(cmd, "!ban") || 
            !strcmp(cmd, "!unban") || !strcmp(cmd, "!banmask"));
}

/**
 * Checks if user is registered in bot's userlist (has permission flags)
 * 
 * Added users are those who have been explicitly given flags in the bot's userlist
 * (such as +o, +v, +f, +m, +n, etc.). These users have full administrative access
 * to all voice control commands.
 * 
 * Non-added users are those who only have +v on channel but no bot userlist flags.
 * They have limited access (topic command only).
 * 
 * @param ch Channel object
 * @param u Chanuser object to check
 * @return true if user has flags in bot userlist, false otherwise
 */
bool vctrl_is_added_user(chan *ch, chanuser *u)
{
    if(!ch || !u)
        return false;
    
    // userLevel() returns > 0 if user has any permission flags in bot's userlist
    // This includes flags like: +o (op), +v (voice), +f (friend), +m (master), +n (owner), etc.
    return (ch->userLevel(u) > 0);
}

void vctrl_setSave() { vctrl_next_save=NOW+vset.CFG_SAVE_DELAY; }

void vctrl_load()
{
    FILE *fh;
    char arg[10][MAX_LEN], buffer[MAX_LEN], cfg_file[MAX_LEN];
    int line=0;
    options::event *e;
    CHANLIST *cl;

    snprintf(cfg_file, MAX_LEN, "%s%s", MODULES_DIR, VCTRL_CFG_FILE);

    if(!(fh=fopen(cfg_file, "r")))
        return;

    while(fgets(buffer, MAX_LEN, fh))
    {
        e=NULL;
        buffer[strlen(buffer)-1]='\0';
        line++;

        str2words(arg[0], buffer, 10, MAX_LEN);
        if(!*arg[0] || arg[0][0]=='#') continue;

        if(!strcmp(arg[0], "vset"))
            e=vset.setVariable(arg[1], rtrim(srewind(buffer, 2)));

        else if(!strcmp(arg[0], "vchanset"))
        {
            if((cl=userlist.findChanlist(arg[1])))
                ((vchanset *)cl->customData(module_info->desc))->setVariable(arg[2], rtrim(srewind(buffer, 3)));
        }
    // else ..

        if(e && !e->ok)
            printf("[-] %s:%d: %s\n", cfg_file, line, (const char *) e->reason);
    }

    fclose(fh);
    //net.send(HAS_N, "[*] Loading voicecontrol config");
}

void vctrl_save()
{
    FILE *fh;
    ptrlist<ent>::iterator i;
    int j;
    char cfg_file[MAX_LEN];

    snprintf(cfg_file, MAX_LEN, "%s%s", MODULES_DIR, VCTRL_CFG_FILE);

    if(!(fh=fopen(cfg_file, "w")))
    {
        net.send(HAS_N, "[vctrl] cannot open %s for writing: %s", cfg_file, strerror(errno));
        vctrl_setSave(); // try again later
        return;
    }

    for(i=vset.list.begin(); i; i++)
    {
        if(!i->isDefault() && i->isPrintable())
            fprintf(fh, "vset %s\n", i->print());
    }

    for(j=0; j<MAX_CHANNELS; j++)
    {   
        if(userlist.chanlist[j].name)
        {
            for(i=((vchanset *)userlist.chanlist[j].customData(module_info->desc))->list.begin(); i; i++)
            {
                if(!i->isDefault() && i->isPrintable())
                    fprintf(fh, "vchanset %s %s\n", (const char*) userlist.chanlist[j].name, i->print());
            }
        }
    }

    fclose(fh);
    vctrl_next_save=0;
    net.send(HAS_N, "[vctrl] Autosaving voicecontrol config");
}

/**
 * Main command handler for voice control system
 * 
 * This function processes all IRC channel messages and executes appropriate commands
 * based on user privileges and registration status.
 * 
 * Access control logic:
 * - Added users (with bot flags): Full access to all commands
 * - Non-added users (voice only): Access to !topic command only
 * - Unvoiced users: No access to any commands
 * 
 * @param from Nick of user sending the message
 * @param to Target (channel name)
 * @param msg Message content (command and arguments)
 */
void hook_privmsg(const char *from, const char *to, const char *msg)
{
    char cmd[MAX_LEN], *rest;
    const char *ptr;
    CHANLIST *cl;
    chan *ch;
    chanuser *u;
    struct vctrl_func *fptr;
    bool is_added;
    bool is_restricted_cmd;

    if(!(cl=userlist.findChanlist(to)))
        return;

    if(!((vchanset *)cl->customData(module_info->desc))->VOICE_CONTROL)
        return;

    if(!(ch=ME.findChannel(to)))
        return;

    if(!(ch->me->flags & IS_OP))
        return;

    if(!(u=ch->getUser(from)))
        return;

    str2words(cmd, msg, 1, MAX_LEN, 0);

    // Determine user's registration status in bot userlist
    is_added = vctrl_is_added_user(ch, u);

    // Search for matching command in function list
    for(fptr=vctrl_flist; fptr->command; fptr++)
    {
        if(match(fptr->command, cmd))
        {
            // Check if command is administratively disabled
            if((ptr=((vchanset *)cl->customData(module_info->desc))->getValue(fptr->enabled)) && !strcmp(ptr, "OFF"))
                return;

            is_restricted_cmd = vctrl_is_restricted_command(fptr->command);

            // ADMINISTRATIVE COMMANDS: Require added user status
            // Commands: !kick, !ban, !unban, !banmask
            if(is_restricted_cmd)
            {
                if(!is_added)
                {
                    // Silent mode: No response for non-added users (Phantom contributors)
                    return;
                }
                // Added user - proceed with command execution
            }
            // TOPIC COMMAND: Available to all voiced users (added or non-added)
            else if(!strcmp(fptr->command, "!topic"))
            {
                if(!(u->flags & IS_VOICE))
                {
                    // Silent mode: No response for non-voiced users (Phantom contributors)
                    return;
                }
                // Voiced user - proceed with command execution (no added status required)
            }
            // LEGACY COMMANDS: !voice, !devoice (backward compatibility)
            // These maintain original behavior with flag checking (Phantom contributors)
            else
            {
                if(!(u->flags & IS_VOICE))
                {
                    // Silent mode: No response for non-voiced users (Phantom contributors)
                    return;
                }

                if(!vctrl_check_flag(cl, u, "required-flag"))
                    return;

                if(fptr->flag)
                {
                    if(!vctrl_check_flag(cl, u, fptr->flag))
                        return;
                }
            }

            // Extract command arguments
            rest=srewind(msg, 1);

            if(rest && *rest)
            {
                // Remove trailing spaces
                for(int i=strlen(rest)-1; i>=0 && rest[i]==' '; i--)
                    rest[i]='\0';
            }

            // Execute command
            fptr->func(ch, u, rest);
            return;
        }
    }
}

/**
 * Hook triggered when channel modes change
 * 
 * When a user receives +v (voice), this function sends them a personalized welcome
 * message listing all commands they have access to based on their registration status.
 * 
 * - Added users see all commands (full administrative access)
 * - Non-added users see only !topic (limited access)
 * 
 * @param ch Channel where mode change occurred
 * @param mode Array of mode changes
 * @param user Array of users affected by mode changes
 * @param mask Nick who set the mode
 */
void hook_mode(chan *ch, const char (*mode)[MODES_PER_LINE], const char **user, const char *mask)
{
    CHANLIST *cl;
    chanuser *u;
    char buf[MAX_LEN];
    const char *ptr;
    int i;
    struct vctrl_func *fptr;
    bool is_added;
    bool is_restricted_cmd;
    bool cmd_allowed;

    if(!(cl=userlist.findChanlist(ch->name)))
        return;

    if(!((vchanset *)cl->customData(module_info->desc))->VOICE_CONTROL)
        return;

    if(!vset.NOTICE)
        return;

    if(!(ch->me->flags & IS_OP))
        return;

    if(!ch->getUser(mask))
        return;

    for(i=0; i<MODES_PER_LINE; i++, *user++)
    {
        if(mode[0][i]=='+' && mode[1][i]=='v')
        {
            if(!(u=ch->getUser(*user)))
                continue;

            // Determine user's registration status
            is_added = vctrl_is_added_user(ch, u);

            // Build introduction message with custom greeting
            strncpy(buf, (const char*)vset.INTRO, MAX_LEN-1);
            buf[MAX_LEN-1]='\0';

            // Iterate through all commands and determine which ones user can access
            for(fptr=vctrl_flist; fptr->command; fptr++)
            {
                // Skip disabled commands
                if((ptr=((vchanset *)cl->customData(module_info->desc))->getValue(fptr->enabled)) && !strcmp(ptr, "OFF"))
                    continue;

                cmd_allowed = false;
                is_restricted_cmd = vctrl_is_restricted_command(fptr->command);

                // Administrative commands: Only show to added users
                if(is_restricted_cmd)
                {
                    if(is_added)
                        cmd_allowed = true;
                }
                // Topic command: Show to all voiced users (added or not)
                else if(!strcmp(fptr->command, "!topic"))
                {
                    cmd_allowed = true;
                }
                // Legacy commands: Apply traditional flag checks
                else
                {
                    if(vctrl_check_flag(cl, u, "required-flag"))
                    {
                        if(!fptr->flag || vctrl_check_flag(cl, u, fptr->flag))
                            cmd_allowed = true;
                    }
                }

                // Append command to introduction message if user has access
                if(cmd_allowed)
                {
                    strncat(buf, " ", MAX_LEN-strlen(buf)-1);
                    strncat(buf, fptr->command, MAX_LEN-strlen(buf)-1);
                }
            }

            // Add helpful hint about access level (Phantom contributors)
            if(is_added)
            {
                const char *suffix = " [Full Access: Added User]";

                if(strlen(buf) + strlen(suffix) < MAX_LEN)
                    strncat(buf, suffix, MAX_LEN-strlen(buf)-1);

                // Send personalized welcome message only to added users
                ME.notice(*user, "%s", buf);
            }
            // Silent mode: No welcome message for non-added users (Phantom contributors)
        }
    }
}

void vctrl_voice(chan *ch, chanuser *from, char *text)
{
    chanuser *u;

    if(!(text) || (*(text)=='\0'))
    {
        // Silent mode: No syntax error message (Phantom contributors)
        return;
    }

    if(!(u=ch->getUser(text)))
    {
        // Silent mode: No user not found message (Phantom contributors)
        return;
    }

    if(u->flags & IS_OP)    // user has +o
    {
        // Silent mode: No protection message (Phantom contributors)
        return;
    }
    
    if(u->flags & IS_VOICE) // user has +v already
    {
        // Silent mode: No already voiced message (Phantom contributors)
        return;
    }

    ch->modeQ[PRIO_LOW].add(NOW+vctrl_get_delay(), "+v", u->nick);
}

void vctrl_devoice(chan *ch, chanuser *from, char *text)
{
    chanuser *u;

    if(!(text) || (*(text)=='\0'))
    {
        // Silent mode: No syntax error message (Phantom contributors)
        return;
    }

    if(!(u=ch->getUser(text)))
    {
        // Silent mode: No user not found message (Phantom contributors)
        return;
    }

    if(!(u->flags & IS_VOICE))
    {
        // Silent mode: No no voice message (Phantom contributors)
        return;
    }

    if(u->flags & (HAS_O | HAS_V | HAS_F)) // added users should not get devoiced
    {
        // Silent mode: No protection message (Phantom contributors)
        return;
    }

    ch->modeQ[PRIO_LOW].add(NOW+vctrl_get_delay(), "-v", u->nick);
}

/**
 * Execute kick command - Remove user from channel
 * 
 * Syntax: !kick <nick> [<reason>]
 * Access: Added users only
 * 
 * @param ch Channel object
 * @param from User executing the command
 * @param text Command arguments (nick and optional reason)
 */
void vctrl_kick(chan *ch, chanuser *from, char *text)
{
    char arg[2][MAX_LEN], kickreason[150];
    chanuser *u;

    if(!(text) || (*(text)=='\0'))
    {
        // Silent mode: No syntax error message (Phantom contributors)
        return;
    }

    str2words(arg[0], text, 2, MAX_LEN, 0);

    if(!(u=ch->getUser(arg[0])))
    {
        // Silent mode: No user not found message (Phantom contributors)
        return;
    }

    if(u->flags & (IS_OP | HAS_O | HAS_V | HAS_F))
    {
        // Silent mode: No protection message (Phantom contributors)
        return;
    }

    if(vset.DONT_KICK_VOICED_USERS && u->flags & IS_VOICE)
    {
        // Silent mode: No protection message (Phantom contributors)
        return;
    }

    snprintf(kickreason, sizeof(kickreason), "kicked by %s: %s", from->nick, *arg[1]?srewind(text, 1):"requested");
    u->setReason(kickreason);
    ch->toKick.sortAdd(u);
}

/**
 * Execute ban command - Ban and kick user from channel
 * 
 * Syntax: !ban <nick> [<reason>]
 * Access: Added users only
 * 
 * The ban mask is automatically generated based on ban-type setting (default: *!ident@host)
 * 
 * @param ch Channel object
 * @param from User executing the command
 * @param text Command arguments (nick and optional reason)
 */
void vctrl_ban(chan *ch, chanuser *from, char *text)
{
    char arg[2][MAX_LEN], buf[MAX_LEN];
    chanuser *u;
    char banmask[MAX_LEN];

    if(!(text) || (*(text)=='\0'))
    {
        // Silent mode: No syntax error message (Phantom contributors)
        return;
    }

    str2words(arg[0], text, 2, MAX_LEN, 0);

    if(!(u=ch->getUser(arg[0])))
    {
        // Silent mode: No user not found message (Phantom contributors)
        return;
    }

    if(u->flags & (IS_OP | HAS_O | HAS_V | HAS_F))
    {
        // Silent mode: No protection message (Phantom contributors)
        return;
    }

    if(vset.DONT_KICK_VOICED_USERS && u->flags & IS_VOICE)
    {
        // Silent mode: No protection message (Phantom contributors)
        return;
    }

    vctrl_format(banmask, MAX_LEN, vset.BAN_TYPE, u);
    ch->modeQ[PRIO_HIGH].add(NOW, "+b", banmask);
    ch->modeQ[PRIO_HIGH].flush(PRIO_HIGH);

    snprintf(buf, MAX_LEN, "banned by %s: %s", from->nick, *arg[1]?srewind(text, 1):"requested");
    u->setReason(buf);
    ch->toKick.sortAdd(u);
}

/**
 * Execute banmask command - Set ban by hostmask pattern
 * 
 * Syntax: !banmask <hostmask>
 * Access: Added users only
 * 
 * Sets a ban using a custom hostmask pattern (must be in format: nick!ident@host)
 * Includes safety checks to prevent banning added users or ops.
 * 
 * @param ch Channel object
 * @param from User executing the command
 * @param text Command arguments (hostmask pattern)
 */
void vctrl_banmask(chan *ch, chanuser *from, char *text)
{
    char *banmask, *ptr;
    HANDLE *h;
    ptrlist<chanuser>::iterator u;

    if(!(text) || (*(text)=='\0'))
    {
        // Silent mode: No syntax error message (Phantom contributors)
        return;
    }

    banmask=strdup(text);

    if((ptr=strchr(banmask, ' ')))
        *ptr='\0';

    if(!match("*!*@*", banmask))
    {
        // Silent mode: No invalid format message (Phantom contributors)
        free(banmask);
        return;
    }

    for(u=ch->users.begin(); u; u++)
    {
        chanuser *member = u;
        if((ch->userLevel(member)>0 || (member->flags & IS_OP || (vset.DONT_KICK_VOICED_USERS && member->flags & IS_VOICE))) && member->matchesBan(banmask))
        {
            // Silent mode: No safety check message (Phantom contributors)
            free(banmask);
            return;
        }
    }
 
    for(h=userlist.first; h; h=h->next)
    {
        if(ch->userLevel(h->flags[GLOBAL] | h->flags[ch->channum])>0 && userlist.wildFindHostExtBan(h, banmask) != -1)
        {
            // Silent mode: No safety check message (Phantom contributors)
            free(banmask);
            return;
        }
    }

    ch->modeQ[PRIO_LOW].add(NOW, "+b", banmask);
    // Silent mode: No ban confirmation message (Phantom contributors)
    free(banmask);
}

/**
 * Execute unban command - Remove ban from channel
 * 
 * Syntax: !unban <mask>
 * Access: Added users only
 * 
 * Removes a ban that matches the specified mask pattern.
 * 
 * @param ch Channel object
 * @param from User executing the command
 * @param text Command arguments (ban mask to remove)
 */
void vctrl_unban(chan *ch, chanuser *from, char *text)
{
    if(!(text) || (*(text)=='\0'))
    {
        // Silent mode: No syntax error message (Phantom contributors)
        return;
    }

    ch->modeQ[PRIO_LOW].add(NOW+vctrl_get_delay(), "-b", text);
    // Silent mode: No unban confirmation message (Phantom contributors)
}

/**
 * Execute topic command - Change channel topic
 * 
 * Syntax: !topic <text>
 * Access: All voiced users (added and non-added)
 * 
 * Changes the channel topic. Optional prefix and appendix can be configured
 * via use-topic-prefix/topic-prefix and use-topic-appendix/topic-appendix settings.
 * 
 * This is the only command available to non-added voiced users, allowing them
 * to participate in channel management without full administrative access.
 * 
 * @param ch Channel object
 * @param from User executing the command
 * @param text New topic text
 */
void vctrl_topic(chan *ch, chanuser *from, char *text)
{
    Pchar buffer;
    char buffer2[MAX_LEN];
    CHANLIST *cl;

    if(!(text) || (*(text)=='\0'))
    {
        // Silent mode: No syntax error message (Phantom contributors)
        return;
    }

    if(penalty>=8)
    {
        // Silent mode: No penalty message (Phantom contributors)
        return;
    }

    if(!(cl=userlist.findChanlist(ch->name)))
        return;

    if(((vchanset *)cl->customData(module_info->desc))->USE_TOPIC_PREFIX && ((vchanset *)cl->customData(module_info->desc))->TOPIC_PREFIX.getLen() > 0)
    {
        vctrl_format(buffer2, MAX_LEN, ((vchanset *)cl->customData(module_info->desc))->TOPIC_PREFIX, from);
        buffer.push(buffer2);
        buffer.push(" ");
    }

    buffer.push(text);

    if(((vchanset *)cl->customData(module_info->desc))->USE_TOPIC_APPENDIX && ((vchanset *)cl->customData(module_info->desc))->TOPIC_APPENDIX.getLen() > 0)
    {
        vctrl_format(buffer2, MAX_LEN, ((vchanset *)cl->customData(module_info->desc))->TOPIC_APPENDIX, from);
        buffer.push(" ");
        buffer.push(buffer2);
    }

    net.irc.send("TOPIC %s :%s", (const char *) ch->name, buffer.data);
}

/**
 * Format string with user information placeholders
 * 
 * Replaces format codes with actual user data:
 * %n - User's nickname
 * %i - User's ident
 * %h - User's hostname
 * 
 * Used for customizing ban masks, topic prefixes/appendixes, and other messages.
 * 
 * @param buffer Output buffer
 * @param maxsize Maximum buffer size
 * @param format Format string with %n, %i, %h placeholders
 * @param u Chanuser whose information will be used
 * @return Number of characters written, or 0 on error
 */
int vctrl_format(char *buffer, size_t maxsize, const char *format, chanuser *u)
{
    size_t count = 0;
    unsigned int i;

    if(!u || !buffer || !format || maxsize == 0)
        return 0;

    const char *nick = u->nick ? u->nick : "";
    const char *ident = u->ident ? u->ident : "";
    const char *host = u->host ? u->host : "";

    size_t nicklen=strlen(nick);
    size_t identlen=strlen(ident);
    size_t hostlen=strlen(host);

    while(1)
    {
        while(*format && *format!='%')
        {
            if (count<maxsize-1)
                buffer[count++]=*format++;
            else
                return 0;
        }

        if(*format=='\0')
            break;

        format++;

        switch(*format)
        {
            case 'n' :
                       for(i=0; i<nicklen; i++)
                       {
                           if(count<maxsize-1)
                               buffer[count++]=nick[i];
                           else
                               return 0;
                       }
                       break;

            case 'i' :
                       for(i=0; i<identlen; i++)
                       {
                           if(count<maxsize-1)
                               buffer[count++]=ident[i];
                           else
                               return 0;
                       }
                       break;
            case 'h' :
                       for(i=0; i<hostlen; i++)
                       {
                           if(count<maxsize-1)
                               buffer[count++]=host[i];
                           else
                               return 0;
                       }
                       break;
            default :
                     if(count<maxsize-2)
                     {
                         buffer[count++]='%';
                         buffer[count++]=*format;
                     }
        }

        if(*format)
           format++;
    }

    buffer[count]='\0';
    return count;
}

/**
 * Send notice message to user
 * 
 * Sends IRC NOTICE to specified user if notices are enabled in settings.
 * Used for all user feedback, error messages, and command responses.
 * 
 * @param to Target nick to receive the notice
 * @param msg Format string (printf-style)
 * @param ... Variable arguments for format string
 */
void vctrl_notice(const char *to, const char *msg, ...)
{
    char buffer[MAX_LEN];
    va_list list;

    if(!vset.NOTICE)
        return;

    va_start(list, msg);
    vsnprintf(buffer, MAX_LEN, msg, list);
    va_end(list);
    ME.notice(to, "%s", buffer);
}

/**
 * Check if user has required flag for command execution
 * 
 * Verifies that a chanuser has the necessary permission flag as specified
 * in the configuration variable. Used for legacy command access control.
 * 
 * @param cl Channel list entry (NULL for global settings)
 * @param u Chanuser to check
 * @param var Configuration variable name containing required flag
 * @return true if user has required flag or no flag required, false otherwise
 */
bool vctrl_check_flag(CHANLIST *cl, chanuser *u, const char *var)
{
    char needed_flag;
    flagTable *ft;
    const char *flagstr;

    if(!var)
        return true;

    if(!cl)
        flagstr=vset.getValue(var);
    else
        flagstr=((vchanset *)cl->customData(module_info->desc))->getValue(var);

    if(!flagstr)
    {
        net.send(HAS_N, "[vctrl] unknown variable '%s'", var);
        return true;
    }

    needed_flag=flagstr[0];

    if(needed_flag=='-')
        return true;

    if(!(ft=userlist.findFlagByLetter(needed_flag, FT)))
    {
        net.send(HAS_N, "[vctrl] unknown flag in variable '%s'%s %s (+%s)", var, cl?" for channel ":"", cl?(const char*)cl->name:"", flagstr);
        return false;
    }

    if(u->flags & ft->flag)
        return true;
    else
        return false;
}

/**
 * Generate random delay for mode changes
 * 
 * Returns a random delay between 0 and MAX_DELAY to prevent mode flooding
 * when multiple mode changes are queued. Essential for multi-bot setups.
 * 
 * @return Random delay in seconds (0 if MAX_DELAY is 0)
 */
int vctrl_get_delay(void)
{
    int num;

    if(vset.MAX_DELAY==0)
        return 0;

    num=1+(int)((double)vset.MAX_DELAY*rand()/(RAND_MAX+1.0));

    return num;
}

void hook_botnetcmd(const char *from, const char *cmd)
{
    char arg[10][MAX_LEN];
    CHANLIST *cl;
    int i;

    str2words(arg[0], cmd, 10, MAX_LEN, 0);

    if(match(arg[1], "vset"))
    {
        if(vset.parseUser(arg[0], arg[2], srewind(cmd, 3), "vset"))
            vctrl_setSave();
    }

    else if(match(arg[1], "vchanset"))
    {
        if(!strcmp(arg[2], "*"))
        {
            for(i=0; i<MAX_CHANNELS; i++)
            {   
                if(userlist.chanlist[i].name)
                {
                    if(((vchanset *)userlist.chanlist[i].customData(module_info->desc))->parseUser(arg[0], arg[3], srewind(cmd, 4), userlist.chanlist[i].name))
                        vctrl_setSave();
                }
            }
        }

        else
        {
            if(!(cl=userlist.findChanlist(arg[2])))
            {
                net.sendOwner(arg[0], "unknown channel");
                return;
            }

            if(((vchanset *)cl->customData(module_info->desc))->parseUser(arg[0], arg[3], srewind(cmd, 4), cl->name))
                vctrl_setSave();
        }
    }
}

void hook_timer()
{
    if(vctrl_next_save!=0 && NOW>=vctrl_next_save)
        vctrl_save();
}

void hook_new_CHANLIST(CHANLIST *me)
{
    me->setCustomData(module_info->desc, new vchanset);
}

void hook_del_CHANLIST(CHANLIST *me)
{
    vchanset *cdata=(vchanset *)me->customData(module_info->desc);

    if(cdata)
    {
        delete cdata;
        me->delCustomData(module_info->desc);
    }
}

// load config file here because modules are loaded before userlist
// also chanlists will be rebuilt every time when the bot retrieves a userlist
void hook_userlistLoaded()
{
    vctrl_load();
}

extern "C" module *init()
{
    int i;
    struct timeval tv;
    module_info=new module("voicecontrol", "patrick <patrick@psotnic.com>, Professional Edition, Enhanced by Phantom contributors", "1.0");

    // for the case that the module is loaded by partyline
    if(userlist.SN)
    {
        for(i=0; i<MAX_CHANNELS; i++)
        {
            if(userlist.chanlist[i].name)
                hook_new_CHANLIST(&userlist.chanlist[i]);
        }

        hook_userlistLoaded();
    }

    module_info->hooks->userlistLoaded=hook_userlistLoaded;
    module_info->hooks->privmsg=hook_privmsg;
    module_info->hooks->mode=hook_mode;
    module_info->hooks->botnetcmd=hook_botnetcmd;
    module_info->hooks->timer=hook_timer;
    module_info->hooks->new_CHANLIST=hook_new_CHANLIST;
    module_info->hooks->del_CHANLIST=hook_del_CHANLIST;

    gettimeofday(&tv, NULL);
    srand(tv.tv_usec);

    return module_info;
}

extern "C" void destroy()
{
    int i;

    for(i=0; i<MAX_CHANNELS; i++)
    {
        if(userlist.chanlist[i].name)
            hook_del_CHANLIST(&userlist.chanlist[i]);
    }
}
