#include <prots.h>
#include <global-var.h>

// Flags that indicate user is "added" to the bot's userlist
// These users should not be devoiced
#define ADDED_USER_FLAGS (HAS_O | HAS_V | HAS_F | HAS_N | HAS_B | HAS_M | HAS_S | HAS_X | HAS_A | HAS_D | HAS_I | HAS_R | HAS_C | HAS_E | HAS_K | HAS_L | HAS_H | HAS_P | HAS_Z)

void hook_botnetcmd(const char *from, const char *cmd)
{
    char arg[10][MAX_LEN];
    int argc;
    chan *ch;
    ptrlist<chanuser>::iterator i;
    int devoiced = 0;
    
    argc = str2words(arg[0], cmd, 10, MAX_LEN, 0);
    
    // Check if command is "mdev"
    if(!strcmp(arg[1], "mdev"))
    {
        // Check if channel argument is provided
        if(argc < 3 || !strlen(arg[2]))
        {
            net.sendOwner(arg[0], "Syntax: .bc %s mdev <#channel>", (const char*) config.handle);
            return;
        }
        
        // Find the channel
        ch = ME.findChannel(arg[2]);
        if(!ch)
        {
            net.sendOwner(arg[0], "Invalid channel: %s", arg[2]);
            return;
        }
        
        // Check if bot has op on the channel
        if(!(ch->me->flags & IS_OP))
        {
            net.sendOwner(arg[0], "I don't have op on channel %s", (const char*) ch->name);
            return;
        }
        
        // Iterate through all users on the channel
        i = ch->users.begin();
        while(i)
        {
            // Check if user has voice
            if(i->flags & IS_VOICE)
            {
                // Skip ops (they don't need voice anyway)
                if(!(i->flags & IS_OP))
                {
                    // Check if user is "added" (has permission flags)
                    // Added users should not be devoiced
                    if(!(i->flags & ADDED_USER_FLAGS))
                    {
                        // User has voice but is not added, remove it
                        ch->modeQ[PRIO_LOW].add(NOW, "-v", i->nick);
                        devoiced++;
                    }
                }
            }
            i++;
        }
        
        // Send confirmation
        if(devoiced > 0)
        {
            net.sendOwner(arg[0], "Mass devoice: removed voice from %d user(s) on %s", devoiced, (const char*) ch->name);
        }
        else
        {
            net.sendOwner(arg[0], "Mass devoice: no users to devoice on %s", (const char*) ch->name);
        }
    }
}

extern "C" module *init()
{
    module *m = new module("mass devoice", "Auto", "1.0.0");
    m->hooks->botnetcmd = hook_botnetcmd;
    return m;
}

extern "C" void destroy()
{
}

