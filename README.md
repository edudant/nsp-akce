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

Verzované SQL migrace jsou v `supabase/migrations`. Testovací data jsou smyšlená
a neobsahují údaje skutečných členů souboru.

## Nasazení

Push do větve `main` spustí kontrolu a nasazení na GitHub Pages. Repozitář musí
mít nastavené tyto GitHub Actions secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Databázová hesla a servisní klíče do frontendu ani repozitáře nepatří.

## Přístup

Správci a zapisovatelé používají e-mailový magic link přes Supabase Auth.
Členský náhled je pouze pro čtení a používá společný kód ověřovaný na serveru.
Oprávnění k tabulkám vynucují RLS politiky v databázi; skrytí prvku ve
frontendovém rozhraní není bezpečnostní hranice.

## Testovací data

Počáteční nasazení obsahuje pouze smyšlená česká jména, události, docházku a
párovací preference. Skutečný Excel ani osobní údaje členů nejsou v repozitáři
ani v nasazené databázi.
