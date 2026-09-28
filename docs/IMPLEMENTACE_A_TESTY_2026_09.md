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
