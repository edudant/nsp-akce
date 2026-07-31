# NSP Akce

Webová aplikace Národopisného souboru Postřekov pro:

- evidenci zkoušek a vystoupení;
- rychlý zápis docházky;
- transparentní bodování;
- evidenci zájmu o vystoupení;
- spravedlivé generování tanečních párů;
- správu členů, zkušenosti a párovacích omezení.

Produkce: [edudant.github.io/nsp-akce](https://edudant.github.io/nsp-akce/)

Podrobná businessová a technická specifikace je v
[`docs/SPECIFIKACE_APLIKACE_DOCHAZKA_A_PAROVANI.md`](docs/SPECIFIKACE_APLIKACE_DOCHAZKA_A_PAROVANI.md).

## Technologie

- React, TypeScript a Vite
- Supabase Postgres a Auth
- GitHub Pages a GitHub Actions
- Vitest

## Lokální spuštění

1. Zkopírujte `.env.example` jako `.env.local`.
2. Doplňte veřejnou URL a veřejný klientský klíč Supabase projektu.
3. Spusťte:

   ```sh
   npm install
   npm run dev
   ```

## Kontroly

```sh
npm run check
```

Příkaz spustí lint, automatické testy a produkční build.

## Databáze

Verzované SQL migrace jsou v `supabase/migrations`. Produkční data byla načtena
ze soukromého pracovního sešitu přímo do Supabase; jména, docházka ani importní
SQL s osobními údaji nejsou součástí veřejného repozitáře. `supabase/seed.sql`
zůstává záměrně bez členských dat.

## Nasazení

Push do větve `main` spustí kontrolu a nasazení na GitHub Pages. Repozitář musí
mít nastavené tyto GitHub Actions secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Databázová hesla a servisní klíče do frontendu ani repozitáře nepatří.

## Přístup

Správci a zapisovatelé používají e-mailový magic link přes Supabase Auth.
Členský náhled je pouze pro čtení a používá společný kód ověřovaný na serveru.
Auth hook dovolí vytvořit trvalý účet pouze e-mailu na interním allowlistu;
anonymní Auth relace jsou vyhrazené pro krátkodobý členský přístup.
Oprávnění k tabulkám vynucují RLS politiky v databázi; skrytí prvku ve
frontendovém rozhraní není bezpečnostní hranice.

## Data

Lokální režim bez připojeného Supabase používá smyšlená ukázková data. Produkční
Supabase obsahuje skutečná data souboru importovaná ze soukromého Excelu.
Zdrojový Excel a osobní údaje členů zůstávají mimo veřejný GitHub.
