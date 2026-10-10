# Vícedenní akce, odpovědi a push

Akce má datum začátku a volitelně jiné datum konce. Časy zůstávají v Europe/Prague. Konec musí být po začátku. Kalendář zobrazí akci každý den jejího rozsahu; osobní kalendář už exportuje celé `starts_at` / `ends_at`. Jedna akce má jednu odpověď, docházku a bodovou váhu pro celý rozsah.

Přijdu / Nepřijdu se ukládají výběrem. Zatím nevím otevře dialog s povinným důvodem. Důvod i ostatní poznámky se ukládají při opuštění pole; zavření dialogu také uloží vyplněný důvod. Prázdný dialog lze zavřít bez změny odpovědi. Chyba uložení ponechá draft pro opakování.

Člen otevře **Notifikace** v menu. Odběr je dobrovolný a platí pro aktuální zařízení a prohlížeč. Na iOS je potřeba aplikaci přidat na plochu. Push vyžaduje HTTPS, podporu Push API a povolení prohlížeče.

Připomínka se odesílá během posledních 24 hodin před deadline otevřeného vystoupení, pokud aktivní propojený člen dosud neodpověděl. `maybe` je odpověď a připomínku nedostává. Private, confirmed, cancelled a draft akce se neodesílají. Odběr lze vypnout; jeho zrušení odstraní i delivery records.

Každý odběr dostane pro akci a konkrétní deadline jednu připomínku. Změna deadline umožní novou. Neúspěšné odeslání lze opakovat po desetiminutové lease; HTTP 404/410 odstraní neplatný odběr. Při pádu mezi přijetím push službou a zápisem delivery může dojít k opakování; stejný notification tag nahrazuje předchozí zobrazení. Push služba přijímá zprávu s TTL nejvýše do deadline.

## Nasazení

1. Před změnou vytvořit privátní PostgreSQL custom dump `public` dat, `auth` schématu bez Auth dat a historie `supabase_migrations`; ověřit čitelnost archivu a SHA-256 manifest. Nasadit pouze migrace `20261010100000_multiday_events.sql` a `20261010110000_push_reminders.sql` v jedné transakci včetně zápisu historie. Původní `production-db-release.sh` je určený pouze pro tři červencové migrace a na aktuální produkci jej nelze použít. Kvůli rozdílné starší historii nepoužívat obecný `supabase db push`.
2. Vygenerovat VAPID pár, například `npx web-push generate-vapid-keys`. Private key uložit pouze jako serverový secret.
3. Nastavit secrets Edge Function: `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY`, `PUSH_VAPID_SUBJECT` (`mailto:` kontakt správce), `PUSH_CRON_SECRET` (náhodný serverový token) a `PUSH_APP_URL` (`https://edudant.github.io/nsp-akce/`, včetně koncového lomítka). Supabase dodává `SUPABASE_URL` a `SUPABASE_SERVICE_ROLE_KEY`.
4. Nasadit `supabase functions deploy push-reminders --no-verify-jwt`. Funkce sama ověřuje `PUSH_CRON_SECRET`.
5. Nastavit public key jako GitHub Actions secret `VITE_PUSH_VAPID_PUBLIC_KEY` a znovu sestavit frontend. Stejný public key patří lokálně do `.env.local`.
6. Do Supabase Vault vložit `push_function_url` a `push_cron_secret`, potom spustit `supabase/operations/schedule_push_reminders.sql`. Job volá funkci každých 15 minut. Při velkém počtu zařízení funkce odbaví nejvýše 100 deliveries za spuštění; sledujte backlog a HTTP výsledky jobu. Zastavení: `select cron.unschedule('nsp-push-reminders');`.
7. Ověřit reálný odběr na podporovaném zařízení a testovací vystoupení s deadline za méně než 24 hodin. Ověřit i vypnutí a odpověď před dalším jobem.

Implementace používá [web-push](https://github.com/web-push-libs/web-push) a [Supabase Cron + Vault](https://supabase.com/docs/guides/functions/schedule-functions).

## Lokální ověření

`npm run check` ověří frontend a serverový handler. `bash scripts/test-multiday-push-local-db.sh` vytvoří dočasný PostgreSQL cluster s plnými migracemi a syntetickými uživateli. DB test pokrývá vícedenní create/update, výběr připomínek, opt out, izolaci vlastníků, oprávnění, deduplikaci a lease retry. Stejný SQL test běží v izolované Supabase CI databázi. Reálné odesílání přes push poskytovatele vyžaduje nasazenou Edge Function a zařízení.

## Produkční server, 10. 10. 2026

Před migrací vznikl ověřený privátní dump `20261010T075535Z-multiday-push`. Dry-run obou migrací skončil rollbackem; ostré nasazení proběhlo v jedné transakci s kontrolou driftu původních funkcí a oprávnění. VAPID klíče jsou nastavené, `push-reminders` je nasazený a Cron aktivní po 15 minutách. Produkční runtime ověřen: neplatný token 401, oprávněné volání bez odběrů 200. Reálné doručení vyžaduje dobrovolný odběr na zařízení.
