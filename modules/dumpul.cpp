/*
 * dumpul.cpp - Moduł do wymuszonego zapisu userlisty
 *
 * Użycie:
 *   1. Skompiluj: make modules (lub ręcznie: g++ -shared -fPIC -o dumpul.so dumpul.cpp -I..)
 *   2. Załaduj do bota: .load dumpul
 *   3. Userlist zostanie zapisana do /tmp/phantom-dump-<pid>.ul
 *
 * Ten moduł omija flagę save_userlist i zapisuje userlistę w formacie plaintext.
 */

#include <prots.h>
#include <global-var.h>
#include <sys/types.h>
#include <unistd.h>

// Funkcja pomocnicza do wysyłania danych użytkownika do pliku
void sendHandleToFile(inetconn *uf, HANDLE *h)
{
    char buf[MAX_LEN];

    if(userlist.isBot(h))
    {
        // Format bota: 13 name creation ip
        uf->send("%s %s %s %s", S_ADDBOT, h->name,
                 h->creation ? h->creation->print() : "0",
                 h->ip ? inet2char(h->ip) : "-");
    }
    else
    {
        // Format użytkownika: 11 name creation
        uf->send("%s %s %s", S_ADDUSER, h->name,
                 h->creation ? h->creation->print() : "0");
    }

    // Flagi globalne: 19 name * flags
    if(h->flags[GLOBAL])
    {
        uf->send("%s %s * %s", S_CHATTR, h->name,
                 flags2str(h->flags[GLOBAL]));
    }

    // Flagi kanałowe
    for(int i = 0; i < MAX_CHANNELS; i++)
    {
        if(userlist.chanlist[i].name && h->flags[i])
        {
            uf->send("%s %s %s %s", S_CHATTR, h->name,
                     userlist.chanlist[i].name, flags2str(h->flags[i]));
        }
    }

    // Hosty: 12 name host
    for(int i = 0; i < MAX_HOSTS; i++)
    {
        if(h->host[i])
        {
            uf->send("%s %s %s", S_ADDHOST, h->name, h->host[i]);
        }
    }

    // Hasło: 30 name md5hash (jeśli istnieje)
    // Pomijamy ze względów bezpieczeństwa - i tak jest zahashowane

    // Info
    if(h->info)
    {
        for(comment *c = h->info; c; c = c->next)
        {
            if(c->key && c->value)
                uf->send("%s %s %s %s", S_ADDINFO, h->name, c->key, c->value);
        }
    }
}

void forceSaveUserlist()
{
    char filename[256];
    snprintf(filename, sizeof(filename), "/tmp/phantom-dump-%d.ul", (int)getpid());

    inetconn uf;

    if(uf.open(filename, O_WRONLY | O_CREAT | O_TRUNC, S_IRUSR | S_IWUSR) < 1)
    {
        net.send(HAS_N, "[-] dumpul: Cannot open %s: %s", filename, strerror(errno));
        return;
    }

    // Nagłówek
    uf.send("# Userlist dumped by dumpul module");
    uf.send("# PID: %d", (int)getpid());
    uf.send("# Bot: %s", (const char*)config.nick);
    uf.send("# Time: %ld", (long)NOW);
    uf.send("#");

    // Kanały: 14 #channel key
    for(int i = 0; i < MAX_CHANNELS; i++)
    {
        if(userlist.chanlist[i].name)
        {
            if(userlist.chanlist[i].pass && strlen(userlist.chanlist[i].pass))
                uf.send("%s %s %s", S_ADDCHAN, userlist.chanlist[i].name,
                        userlist.chanlist[i].pass);
            else
                uf.send("%s %s", S_ADDCHAN, userlist.chanlist[i].name);
        }
    }

    // Użytkownicy i boty
    HANDLE *h = userlist.first;
    while(h)
    {
        sendHandleToFile(&uf, h);
        h = h->next;
    }

    // Sequence number
    char buf[64];
    snprintf(buf, sizeof(buf), "%llu", userlist.SN);
    uf.send("%s %s", S_SN, buf);
    uf.send("%s %ld", S_TIMESTAMP, userlist.timestamp);

    net.send(HAS_N, "[+] dumpul: Userlist saved to %s", filename);
    printf("[+] dumpul: Userlist saved to %s\n", filename);
}

extern "C" module *init()
{
    module *m = new module("dumpul", "recovery tool", "1.0");

    // Zapisz userlistę natychmiast po załadowaniu modułu
    forceSaveUserlist();

    return m;
}

extern "C" void destroy()
{
    // Nic do sprzątania
}
