#include <prots.h>
#include <global-var.h>

static void op_show_menu(const char *target)
{
    ME.notice(target, "OP Module - Available commands:");
    ME.notice(target, "  !op          - Request channel operator (@) status");
    ME.notice(target, "  !ophelp      - Show this help menu");
}

void hook_privmsg(const char *from, const char *to, const char *msg)
{
    if(match("!ophelp*", msg) || match("!op ?*", msg))
    {
        chan *ch = ME.findChannel(to);
        if(!ch)
            return;

        chanuser *u = ch->getUser(from);
        if(!u || !(u->flags & HAS_O))
            return;

        op_show_menu(from);
        return;
    }

    if(!match("!op*", msg))
        return;

    chan *ch = ME.findChannel(to);
    if(!ch)
    {
        ME.notice(from, "I am not on that channel ;/");
        return;
    }

    chanuser *u = ch->getUser(from);
    if(!u || !(u->flags & HAS_O))
        return;

    if(u->flags & IS_OP)
    {
        ME.notice(from, "You already have @ on %s", to);
        return;
    }

    if(!(ch->me->flags & IS_OP))
    {
        ME.notice(from, "Sorry, but I am not oped");
        return;
    }

    ch->modeQ[PRIO_LOW].add(NOW, "+o", u->nick);
}

extern "C" module *init()
{
    module *m = new module("example #1: !op public command", "Grzegorz Rusin <pks@irc.pl, gg:0x17f1ceh>", "0.1.0");
    m->hooks->privmsg = hook_privmsg;
    return m;
}

extern "C" void destroy()
{
}

