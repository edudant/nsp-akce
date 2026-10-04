# Osobní odběry kalendáře

Na stránce Akce má aktivní členský účet tlačítko **Přidat do kalendáře**.
Admin potřebuje stejné aktivní členské propojení; společný přístup odběry nemá.
Každý účet může mít jeden aktivní odběr všech akcí, zkoušek a vystoupení.

URL je bearer secret. Token se vrací pouze při vytvoření/náhradě a frontend
jej drží pouze v otevřeném dialogu. Po zavření je dostupná jen metadata.
Náhrada vyžaduje potvrzení a opětovné přidání odběru do osobního kalendáře.
Zneplatnění odstraní přístup k dalším stažením; osobní kalendář může ponechat
již stažené akce. Starý odběr proto uživatel odebere přímo v kalendáři.

## Data a odpovědi

Server kontroluje `members.is_active`, `member_accounts.linked_user_id`
a `profiles.member_id` při každém GET/HEAD. Používá členskou viditelnost
(`public`, `members`, `shared`) bez draftů, posledních 12 kalendářních měsíců
od okamžiku stažení a všechny budoucí akce, nezávisle na sezóně.
Zrušené zveřejněné akce zůstávají s původním UID a `STATUS:CANCELLED`.

Název používá aktuální `event_responses.response`, stejně jako aplikace.
Popis obsahuje poznámku akce, aktuální odpověď a poslední členskou/admin
odpověď podle stejného auditu jako `attendance_provenance_v4`. Časy jsou UTC;
`LAST-MODIFIED` a `DTSTAMP` zahrnují i změny odpovědi. Osobní poznámky odpovědí,
členové, docházka a párování se do projekce nedostanou.
ICS nemá `VALARM`; případné výchozí reminders v klientu řídí uživatel.

## Nasazení

Původní zadání obsahovalo pouze lokální implementaci; nasazení uživatel
autorizoval následně 4. 10. 2026. Pořadí releasu je **DB → Edge Function
→ frontend**. Dodržet [zálohovaný DB release postup](PRODUKCNI_NASAZENI_DB.md).
Původní `production-db-release.sh apply` má pevný seznam starších migrací;
novou migraci jím nelze aplikovat. Kvůli rozdílné historii nepoužívat obecné
`supabase db push`.

1. Zkontrolovat project ref, skutečné schéma a historii migrací. Tento release
   vyžaduje všechny předchozí projektové migrace včetně členského propojení,
   audit provenance a aktuálního modelu akcí. Neaplikovat znovu starší migrace.
2. Vytvořit a ověřit čerstvý privátní backup přes
   `scripts/production-db-release.sh backup`: celé `public`, Auth schéma a
   historie migrací. K backupu uložit přesné SQL tohoto release, SHA-256,
   snapshot funkcí/grantů a počtů. Připravit ověřený restore na izolované DB.
3. Provést rollback dry-run nové migrace a syntetických SQL testů na izolované
   kopii aktuálního schématu. Potom jako schválený DB release spustit pouze
   `supabase/migrations/20261004100000_calendar_subscriptions.sql` v jedné
   transakci (`psql -v ON_ERROR_STOP=1 --single-transaction -f …`). Heslo
   předat skrytým promptem/`PGPASSWORD`, nikdy URL nebo argumentem. Po úspěchu
   označit pouze verzi `20261004100000` jako applied v Supabase migration
   history a ověřit grants/index/RLS. Při chybě frontend neuvolnit.
4. Nastavit Edge secret `CALENDAR_APP_URL=https://edudant.github.io/nsp-akce/`.
   `SUPABASE_URL` a `SUPABASE_SERVICE_ROLE_KEY` poskytuje Supabase runtime;
   service key nepatří do frontendových env. Nasadit
   `supabase functions deploy calendar-feed --no-verify-jwt` do ověřeného
   projektu. `supabase/config.toml` obsahuje stejné nastavení JWT.
5. Ověřit serverovou projekci skutečnou service rolí, zákaz přímého přístupu
   anon/authenticated a zákaz klientského RPC `get_calendar_feed`. Vytvořit
   testovací odběr přes vlastní účet, ověřit GET/HEAD, filtr, změnu odpovědi,
   cancellation, náhradu a zneplatnění. Chyba DB musí být 503, ne úspěšné ICS.
6. Až poté vydat frontend s existujícím `VITE_SUPABASE_URL` (HTTPS). Provést
   smoke test dialogu a níže uvedené reálné klientské scénáře. Testovací odběry
   následně zneplatnit.

Tokeny nevkládat do logů, analytiky, screenshotů, ticketů ani veřejných test
výstupů. Handler neloguje request ani DB error. GET obsahuje token v query;
před publikací zkontrolovat redakci query stringů v gateway/access logách
Supabase a případných proxy/monitoringu. Nepřidávat CDN ani veřejnou cache.
Všechny odpovědi mají `private, no-store`, `Pragma: no-cache` a
`Referrer-Policy: no-referrer`. Monitorovat jen počty HTTP statusů a latence.
Uniklý odkaz nahradit v dialogu; kompromitovaný feed lze nouzově vypnout
zneplatněním příslušných DB záznamů přes schválený ops postup.

Rollback frontendové funkce neobnovuje zneplatněné tokeny. Při rollbacku Edge
Function musí endpoint selhat bez dat. DB záznamy zachovat; jejich odstranění
je samostatný schválený release s backupem.

## Lokální ověření

```sh
npm run check
npm run test:calendar:db
npm run test:calendar:integration # spuštěný izolovaný Supabase + functions serve
```

SQL runner vytvoří dočasný PostgreSQL 17 cluster bez TCP listeneru, přehraje
všechny migrace a použije syntetický Auth stub. Cluster po testu odstraní.
Vyžaduje PostgreSQL tools v PATH; v sandboxu může shared memory vyžadovat
schválené spuštění mimo sandbox. Stejný SQL test je připojený také do
`scripts/test-feature-local-db.sh` pro izolovaný skutečný Supabase stack.

SQL test pokrývá grants, zákaz přímého čtení/zápisu, izolaci vlastníků včetně
admina, samostatné typy, náhradu a revocation, deaktivaci, obě propojení účtu,
období včetně hranice 12 měsíců, budoucnost napříč sezónami, drafty/soukromé
akce, cancellation a členské/admin odpovědi bez osobních poznámek.
Vitest ověřuje skutečný HTTP handler a ICS serializer: hashing tokenu,
GET/HEAD, 404/405/503, cache headers, UTC na DST hranicích, escaping, CRLF,
UTF-8 folding, stabilní UID, změny názvu/odpovědi/časů a absenci reminders.
UI testuje oprávnění tlačítka, dialog, kopírování, potvrzení náhrady,
revocation a chyby.

Lokálně prošly plné migrace a SQL integrace na PostgreSQL s Auth stubem,
feed/handler a UI testy i `npm run check` (158 testů). Před releasem byl
spuštěn nový izolovaný Docker Supabase projekt `nsp-feature-tests-20261004-1`:
plné SQL suites a šest HTTP integračních scénářů kalendáře prošlo na skutečném
Deno runtime přes PostgREST/JWT. Test ověřil GET/HEAD, odpověď člena bez
osobní poznámky, cancellation/UID, náhradu tokenu, deaktivaci, změnu propojení
a revocation. Stejný HTTP test běží před frontendovým deploymentem v CI.
Testovací CALENDAR_APP_URL vytváří `scripts/setup-feature-local.mjs`;
functions serve musí dostat `--env-file "$NSP_TEST_WORKDIR/calendar-function.env"`.

Lokální legacy CLI start/functions serve potřeboval explicitní built-in profil
`supabase`; nový CLI wrapper neprošel s uloženým management profilem.
Bundled `supabase-go --profile supabase` problém obešel bez změny profilu.

## Osobní kalendáře a dosud neověřené scénáře

Dialog nabízí HTTPS a webcal variantu. Odběr průběžně načítá zdroj; import ICS
je jednorázová kopie. Refresh interval řídí klient a změny nejsou okamžité.
Návody vycházejí z [Google Calendar Help](https://support.google.com/calendar/answer/37100),
[Apple Calendar User Guide](https://support.apple.com/guide/calendar/welcome/mac)
a [Outlook Support](https://support.microsoft.com/en-us/outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web).
Formát odpovídá pravidlům [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545).

Bez veřejného nasazení a přístupu k osobním kalendářům nebyly ověřeny:

- Google Calendar: přidání přes „Jiné kalendáře → Z adresy URL“, první fetch,
  následný refresh názvu, odpovědi, času, cancellation a odstranění starého
  odběru po náhradě.
- Apple Calendar: nový odběr přes HTTPS/webcal, automatický refresh při
  zvoleném intervalu, DST zobrazení, cancellation a chování po revocation.
- Outlook web/desktop: odběr z webu, následný refresh, cancellation, zachování
  UID a chování po revocation/náhradě.

Při předprodukčním smoke testu ověřit také lokální nastavení reminders klientů,
reálné gateway logy bez tokenů a nemožnost cache úniku mezi dvěma odběry.

## Release 4. 10. 2026

Výchozí frontend `1ed443ab` a všechny DB migrace z 1. října byly ověřeny
proti skutečné produkci; původní lokální checkout měl starší HEAD `932e1cb`.
Release kalendáře je připravený nad aktuálním main, bez opakovaného nasazení
starších změn. Původní checkout má zálohu working/index diffů a untracked souborů.

Před DB změnou vznikl čerstvý privátní custom dump mimo repository s SHA-256
manifestem, snapshotem metadat a kopiemi release SQL. Produkční dry-run skončil
rollbackem; poté byla migrace i její history aplikovaná v jedné transakci.
Postflight ověřil RLS, zákaz přímého přístupu, service-only projekci, grants
členských RPC a unique index aktivních odběrů. `calendar-feed` má
`verify_jwt=false` a produkční CALENDAR_APP_URL. Tokeny nejsou v release výstupech.

Produkční smoke používá HEAD bez stažení obsahu akcí, neplatný token a
revocation s krátkodobým syntetickým účtem, který se po testu odstraní.
Platný produkční GET nebyl lokálně stažen: automatické schvalování odmítlo
export reálných dat akcí do lokálního procesu. Obsah GET je ověřený na
syntetických datech ve skutečném lokálním Supabase/Deno runtime. Skutečný
odběr a refresh v osobních kalendářích nadále vyžaduje uživatelský smoke test.

## Úprava nápovědy a mobilní ikony

Nápověda používá běžné názvy „odkaz“ a „Získat odkaz“ a konkrétní kroky.
Tlačítko „Zkopírovat a otevřít Google Kalendář“ zkopíruje odkaz a otevře
oficiální Google stránku pro přidání pomocí URL v nové záložce. Uživatel
odkaz vloží a přidání potvrdí; Google podporuje tento krok v prohlížeči na
počítači. Do adresy odchozího Google odkazu se token nepřidává.
Alternativní webcal odkaz je v rozbalovací části pro jiné kalendáře.

Tlačítko odběru na stránce Akce má ikonu i přístupný název a tooltip.
Mobilní layout schovává text tlačítek v hlavičce, proto bez ikony dříve
zobrazoval prázdný čtverec. UI test kontroluje přítomnost ikony.
