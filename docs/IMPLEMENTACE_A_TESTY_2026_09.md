# Sezóny, účast, páry a písně

Implementováno podle [schváleného zadání](ZADANI_SEZONY_UCAST_A_PAROVANI.md).
Katalog obsahuje 57 názvů/kombinací a dvě kategorie z přílohy. Kategorie
jednotlivých písní přiřazuje admin v settings.

## Kontroly

Ověřeno lokálně na Supabase/PostgreSQL 17 v Dockeru se syntetickými účty
`example.invalid`. Produkční data ani produkční SMTP testy nepoužívají.

- `npm run check`: lint, 76 unit/component testů a production build.
- Integrační test: 17 scénářů přes skutečné Auth, REST, RPC a Edge Function.
  Kontroluje admin/member/shared oprávnění, soukromá pole, deadline včetně
  cron bez načtení aplikace, procentní body, překryv sezón a vlastní období,
  validaci/publikaci párů, skutečné stání, více zkouškových sad, Koledy,
  katalog, série, souběžnou rezervaci písně a jednorázový login kód.
- Chromium: 13 scénářů admin/member/shared flows, vytvoření vystoupení, přihlášení
  adminovým kódem přes login formulář, dvojí zařazení, výběr účastníků,
  tuning, ruční editace, draft/publikace, série písní, uzamčení odpovědí,
  settings, procentní docházka, další zkoušková sada, filtry bodů, Help
  klávesnicí a mobilní layout 390 px.
- Přehrání všech migrací s vloženými staršími záznamy; šest kontrol zachování
  skupin, odhadů/deadline, procentních bodů, zkouškové sady a „nevím“, plus
  kontrola privátních oprávnění.
- Původní DB smoke testy mají všechny violation counters nula. Původní
  `member_profile_write_security_test.sql` prochází s rollbackem.

Původní `member_mvp_functional_test.sql` dokumentuje kontrakt v2. Pro nový
kontrakt ho nahrazuje integrační test výše: nově je deadline povinný a RPC
vracející privátní hodnocení členovi jsou záměrně nedostupná.

## Opakování lokálních testů

Vyžaduje Docker, Supabase CLI a nainstalované frontend dependencies.

```sh
node scripts/setup-feature-local.mjs
supabase start --workdir /tmp/nsp-supabase-tests --exclude studio,storage-api,realtime,postgres-meta,logflare,vector,supavisor
bash scripts/test-feature-local-db.sh --reset
supabase functions serve --workdir /tmp/nsp-supabase-tests --no-verify-jwt
```

Poslední příkaz běží v samostatném terminálu. Funkce sama ověřuje JWT
přes `auth.getUser()` a admin roli přes databázi. Reset script je omezený
na kontejner `supabase_db_nsp-feature-tests`; smaže pouze jeho `public` schema.

```sh
NSP_KEEP_TEST_FIXTURES=1 npm run test:integration
npm run dev:features
```

Dev server běží v samostatném terminálu na portu 5175. Browser test potřebuje
Playwright s Chromium, případně `PLAYWRIGHT_MODULE` s cestou k dostupnému
modulu. Testuje pouze lokální URL a syntetické fixtures.

```sh
npm run test:browser
npm run check
```

Screenshots: `/tmp/nsp-supabase-tests/screenshots`. Fixtures a přístupové
údaje jsou pouze lokální a do repozitáře se neukládají. Bez
`NSP_KEEP_TEST_FIXTURES=1` integrační test své účty a záznamy odstraní.

## Příprava nasazení

Použijte zálohovaný release postup
z [produkční dokumentace](PRODUKCNI_NASAZENI_DB.md), s novým seznamem migrací;
stávající release script je určen pro předchozí vydání.

1. Záloha a kontrola aktuální migrační historie produkce.
2. `20260928100000_confirmed_event_status.sql` aplikovat v samostatné transakci
   s commitem před další migrací kvůli rozšíření PostgreSQL enumu.
3. Aplikovat `20260928101000_seasons_attendance_songs.sql` a
   `20260928102000_song_catalog.sql`.
4. Nasadit `generate-member-login-code` se serverovým ověřením JWT
   (`verify_jwt = false` v configu). Service key patří pouze do Edge Function.
5. Ověřit aktivní cron job `nsp-confirm-deadlines`, stávající Auth hook,
   OTP platnost 900 s a provést DB smoke testy.
6. Nasadit frontend a ověřit admin/member/shared přístup.

Migrace zachová stávající přiřazení událostí k sezónám. Původní zařazení
člena se přenese jako prioritní, původní odhad párů jako Starý; admin může
upravit druhé zařazení a rozdělení odhadu. Vystoupení bez deadline dostane
začátek události. Starší „nevím“ bez poznámky dostane označenou původní
poznámku. Zkouškové sady zůstávají, ale nepočítají se jako skutečná historie
vystoupení. Minutová částečná účast se převede na procenta.

Typ sezóny s existujícími událostmi nelze změnit. Událost s uloženými páry
nelze přesunout do Koled; místo toho vytvořte samostatnou koledovou událost.
Generátor používá tvrdé zákazy a optimalizuje vážená doporučení; konfliktní
přání mohou zůstat nesplněná, jak popisuje Help.

## Admin: zobrazení jako člen

Tlačítko „Zobrazit jako člen“ nad obsahem přepne admina do členského pohledu.
„Zpět do administrace“ obnoví správu. Funguje i na mobilu. Z Nastavení nebo
Členů přepnutí vede na přehled. Obnovení stránky vrací admin zobrazení.

Náhled používá RPC `member_preview_v3`, stejné read projekce jako člen a
oddělenou query cache. Skrývá interní údaje, draft události, nezveřejněné
páry, nepotvrzené série a ostatní odpovědi před potvrzením vystoupení.
Oprávnění skutečného účtu se nemění. Osobní historie, odpovědi a přání patří
přihlášenému adminovi; ukládání odpovědí je skutečná změna. Admin bez
propojeného člena vidí přehled bez osobních odpovědí. V aplikaci je Help.

Migrace: `20260928120000_admin_member_preview.sql`. Integration testy
ověřují omezení dat i scores, vlastní identitu, odmítnutí non-admin a
zachování admin přístupu. Browser test ověřuje přepnutí z Nastavení,
členské ovládání, potvrzené série, skrytí zkušeností a návrat na mobilu.

## Akce, kompaktní nastavení a audit (29. 9.)

- Přepnutí „Zobrazit jako člen / správce“ je pouze v menu.
- Nastavení má přímé menu odkazy Sezóny, Pásma, Písně, Přístupy a Data.
  Evidence používají stejné kompaktní řádky, detail a formulář nové položky.
- Český název je Akce; `events` a existující URL `/udalosti` zůstávají.
- Detail Akce se přepíná mezi detailem a vlastní účastí, účastníky, páry
  a pásmy. Pásma zahrnují také série písní. Koledy nemají sekci párů.
- Účastníci mají rychlou změnu skutečné účasti v řádku. Detail obsahuje
  procenta, odpověď, přání a historii. Přidání zapíše plnou účast i na serveru.
- Uzavření obou typů akcí převezme Ano/Ne jen pro nezapsanou skutečnou
  účast; ruční záznamy se zachovají. Nevím a bez odpovědi zůstanou nezapsané.
  Výběr pro párování se sjednotí podle skutečné přítomnosti.
- Stavové přechody mají tlačítka a vysvětlení před provedením. Uzavření je
  povolené po začátku. Zrušení ani opětovné otevření nemaže historii.
- Audit používá stávající append-only historii a nově ukládá roli a jméno
  autora v okamžiku změny i zdroj automatického převzetí. Starší záznamy
  zůstávají označené bez domýšlení původní role. Read RPC vrací pouze
  vybraná pole, správce vidí vše, člen pouze vlastní historii. Sdílený přístup
  nemá audit. Členský preview respektuje stejné omezení.

Migrace: `20260929090000_action_attendance_audit.sql`. Nové integration
scénáře kontrolují původní odpověď po opravě, audit a jeho privacy, automatickou
přítomnost při přidání a převzetí účasti při uzavření vystoupení. Browser test
ověřuje menu, nastavení, skutečnou účast v detailu, audit a stavová tlačítka.

## Mobilní detail a odpovědi (29. 9.)

- Dialog zaměřuje okno pouze při otevření. Změna formuláře už neodebírá focus.
- Seznam Akcí má sekce pod sebou, defaultně všechny aktivní sezóny obou typů;
  starší lze přidat filtrem. Přehled začíná nejbližší akcí s vlastní odpovědí.
- Detail a vlastní účast jsou trvale nahoře. Člen vidí jen relevantní taby,
  potvrzené série a uložené páry. Zkouškové sady se přepínají od poslední.
- Pásma a série lze zadávat i na zkoušce. Přidání účastníků má checkboxy
  a společné tlačítko; dialog se zavře až po obnovení seznamu a generátoru.
  Nastavení účasti je v menu řádku, detail rozlišuje nahlášení a skutečnou účast.
- Odpovědi jsou sjednocené: Ano, Ne, Zatím nevím s neprázdnou poznámkou,
  včetně zkoušek. Náhradník není povolený na serveru ani nabízený v UI.

Migrace: `20260929120000_rehearsal_maybe_response.sql`. Regresní UI testy
ověřují focus při psaní, sezóny, relevantní taby, přepínání sad a přehled.
Browser test zahrnuje mobilní psaní v editaci a hromadné přidání před generováním.
