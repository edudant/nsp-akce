# Bezpečné nasazení členského MVP do produkční databáze

Původní zálohovaný release skript se týká prvních tří migrací:

- `20260731200000_member_accounts_and_auth.sql`
- `20260731201000_programs_pairing_blocks_and_wishes.sql`
- `20260731202000_member_portal_and_pairing_reports.sql`

Produkční projekt je `vvjrfwgbapvkmhxqeqrq`. Vzdálená historie starších
migrací není shodná s lokálním adresářem, proto se při tomto vydání nesmí použít
obecné `supabase db push`. Release skript aplikuje pouze uvedené tři soubory a
potom je jednotlivě označí jako provedené v historii Supabase.

Po tomto základním vydání byly v samostatné transakci nasazeny ještě dvě
kompatibilní doplňkové migrace:

- `20260731203000_secure_public_pairing_and_shared_history.sql`
- `20260731204000_update_event_program.sql`

První omezuje veřejné projekce párování a druhá přidává atomickou editaci
programu události. Před jejich nasazením vznikl samostatný snapshot funkcí,
oprávnění a počtů; oba soubory prošly nejprve vzdáleným transakčním dry-runem.

## 1. Kontrola bez změn

Z kořene repozitáře spusťte:

```sh
./scripts/production-db-release.sh inspect
```

Příkaz zkontroluje propojený project ref, kontrolní součty tří migrací,
vzdálený databázový lint, statistiky a rozdíly v historii. Vzdálenou databázi
nemění.

## 2. Privátní záloha před migrací

Na počítači musí být klient PostgreSQL 17 nebo novější. Potom spusťte:

```sh
./scripts/production-db-release.sh backup
```

Heslo databáze zadejte do skrytého promptu. Nepoužívejte heslo v URL ani v
argumentu příkazu. Skript vytvoří adresář se soukromými oprávněními vedle
repozitáře, standardně `../nsp-akce-private-backups/<UTC čas>`.

Záloha obsahuje v jednom konzistentním PostgreSQL custom dumpu:

- celé schéma a všechna data `public`, tedy i všechny dotčené produkční
  tabulky;
- schéma `auth` bez citlivých dat uživatelů;
- schéma a data historie `supabase_migrations`;
- počty řádků dotčených tabulek, výpis historie, lint, přesné release SQL a
  SHA-256 manifest.

Záloha nesmí být přesunuta do veřejného repozitáře ani sdílena bez šifrování,
protože obsahuje osobní údaje členů. Skript odmítne zálohu uvnitř repozitáře.

## 3. Explicitní nasazení

Použijte přesnou cestu vypsanou na konci zálohy:

```sh
./scripts/production-db-release.sh apply --apply \
  --backup-dir /absolutni/cesta/nsp-akce-private-backups/20260731T120000Z
```

Skript před změnou znovu ověří:

- project ref a připojení;
- nezměněné kontrolní součty migrací;
- SHA-256 všech souborů zálohy a její stáří nejvýše 24 hodin;
- že žádná ze tří migrací ani její nové tabulky ještě nejsou přítomné;
- interaktivně opsaný project ref.

Všechny tři SQL soubory se provedou v jedné PostgreSQL transakci s časovým
limitem zámků. Chyba SQL tedy vrátí celé schéma do stavu před migrací. Po
úspěšném commitu skript označí jen tyto tři verze pomocí `migration repair` a
spustí read-only smoke testy nad produkčními daty.

## 4. Výjimečný stav po commitu

Pokud uspěje SQL transakce, ale selže následný zápis historie, nové schéma už
existuje. Migrace znovu nespouštějte. Opravte pouze historii:

```sh
read -r -s -p "DB heslo: " SUPABASE_DB_PASSWORD
export SUPABASE_DB_PASSWORD
npx --yes supabase@2.109.1 migration repair --linked --status applied \
  20260731200000 20260731201000 20260731202000 --yes
unset SUPABASE_DB_PASSWORD
```

Pak ověřte stav příkazem `./scripts/production-db-release.sh inspect`. Protože
starší lokální a vzdálená historie zůstávají rozdílné, ani poté nepoužívejte
obecný `supabase db push`, dokud nebude jejich původ samostatně zrekonstruován.

## 5. Ověření zálohy a případná obnova

Custom dump lze bezpečně prohlédnout bez obnovy:

```sh
pg_restore --list /absolutni/cesta/database-before.dump
```

Případnou obnovu nejprve proveďte do samostatné prázdné PostgreSQL databáze a
ověřte počty proti `affected-row-counts.tsv`. Automatická obnova přímo přes
produkci záměrně není součástí skriptu: mohla by přepsat nové RSVP nebo jiné
zápisy vzniklé po záloze. Produkční návrat se proto provádí pouze po vyhodnocení
incidentu a s konkrétním plánem pro zachování novějších dat.

## 6. Supabase Auth a serverová funkce

Produkce má nastavenou GitHub Pages Site URL, lokální callbacky, Before User
Created hook, šestimístný OTP s platností 15 minut, 60sekundový interval,
vlastní Gmail SMTP a kombinovanou šablonu odkazu a kódu. Magic link používá
jednorázový `token_hash`, takže funguje i po otevření v jiném mobilním okně.

Pozvánky odesílá ověřená Edge Function. Po změně jejího zdroje se nasazuje
samostatně, protože GitHub Pages publikuje pouze frontend:

```sh
npx --yes supabase@2.109.1 functions deploy send-member-invitation \
  --project-ref vvjrfwgbapvkmhxqeqrq --use-api
```

SMTP aplikační heslo ani databázové heslo nepatří do GitHubu, `.env` souboru
frontendu ani do dokumentace. V repozitáři je pouze odkaz
`env(GMAIL_SMTP_APP_PASSWORD)`; skutečná hodnota je uložena jen v produkčním
Auth nastavení Supabase.
