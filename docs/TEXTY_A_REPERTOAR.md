# Texty a repertoár

Hlavní menu **Texty** má záložky Pásma, Písničky a Koledy. Seznam používá
společný `ListRow`, hledání bez diakritiky, řazení a filtry aktivity/kategorie.
Členové a společný přístup mohou číst všechny detaily; admin přidává položky,
upravuje údaje i jednotlivé bloky textu. Proklik je také v programu akce a
v seznamu vybraných písní. Jednorázové vlastní pásmo nemá katalogový detail.

Obsah je JSON s bloky `heading`, `text`, `dialogue`, `note` a volitelnou
poznámkou připojenou k bloku. React vykresluje plain text, zachovává řádky slok
a zalamuje obsah na mobilu. Čtenář nastavuje velikost písma posuvníkem (15–26 px, volba se pamatuje)
nebo skryje poznámky. Na mobilu jsou poznámky malou kurzívou pod textem,
na široké obrazovce vedle příslušného řádku. Import z Wordu zachovává
tučné části a oddělení slok pomocí `emphasis` a `spaceBefore`.
Texty se načítají až při otevření detailu. Běžné písničky mohou zatím zůstat
bez textu; admin je může později doplnit stejným editorem.

Koledy jsou v `songs` oddělené pomocí `kind = 'carol'`; běžné písně mají
`kind = 'song'`. Výběr v sérii filtruje podle typu sezóny události. DB trigger
kontroluje totéž při zápisu, takže pravidlo platí i pro přímý RPC call.
Historická data se nemění. Import nepřepisuje existující obsah a celý batch
je atomický. Editace kontroluje `updated_at`, aby nepřepsala souběžnou změnu.

## Převod podkladů

Originály ani importované texty s obsazením nejsou součástí veřejného repozitáře.
Výstupy patří do ignorované `.local/` a při importu do DB.

```sh
node scripts/convert-program-texts.mjs "$HOME/Downloads"
# Použijte Python s pdfplumber, např. bundled workspace runtime.
python3 scripts/convert-carols.py "$HOME/Downloads/Koledy zpěvník kompletní 2025-1_261001_145750.pdf"
```

Převod Wordu používá macOS `textutil` a `jsdom`. Konkrétní známé dokumenty
rozlišuje podle formátu; kurzíva celého zpívaného textu není poznámka.
Kontrola porovnává všechny znaky obsahu před a po převodu, mimo whitespace,
layout separators a zápatí Wordu. Nářečí, repetice i zkrácené texty zůstávají.
Ve zdroji Postřekovo jsou dva texty jen naznačené, nepřidáváme chybějící sloky.
Soubor Strašidla má vnitřní nadpis „Daremný pjí­sničky“; detail na rozdíl upozorňuje.

PDF má 68 stran, z toho první je obrazová titulní strana. Ze 67 textových stran
vzniká 65 koled. Strany 44 a 52 přesně opakují strany 6 a 43; `sourcePages`
zachovává oba odkazy. Dvojí text na straně 48 je převeden do samostatných bloků
s označením pravého sloupce. Hudební poznámky a označení hlasů zůstávají.
Dekorace se do čtečky nepřenášejí.

## Nasazení

Použijte zálohovaný postup z `PRODUKCNI_NASAZENI_DB.md` pro migrace
`20261001150000_program_texts.sql` a `20261001151000_carol_repertoire.sql`.
Vyžadují předchozí migrace aplikace včetně sezón a aktuálního přístupu v3.
Frontend vyžaduje nové RPC. Nepoužívejte obecný `supabase db push`.

Po migraci admin v **Texty → Pásma → Import textů pásem** importuje
`.local/program-texts.json`; v **Texty → Koledy → Import zpěvníku** importuje
`.local/carols.json`. Bez importu se zobrazuje stav „text zatím není doplněný“.
Import je určen pro první nahrání. Další úpravy se provádějí v detailu.

## Ověření

`npm run check` ověřuje lint, frontend testy a build. Testy TextsPage pokrývají
oddělení repertoárů, filtry, proklik, zachování slok při skrytí poznámek,
admin editaci a validaci importu. Zápisové a čtecí RPC vynucují oprávnění
na serveru; tabulky obsahu nemají přímé oprávnění pro klienta.

Lokálně byly nové migrace a RPC ověřeny v izolovaném PostgreSQL 17 s malým
fixture předchozího schématu: import 11 pásem a 65 koled, atomický rollback,
konflikt souběžných editací, zákaz zápisu členům/společnému přístupu,
zákaz nepřihlášeného čtení a zákaz výběru nesprávného repertoáru.
To nenahrazuje replay celé Supabase migrační historie; Docker zde neběžel.

Opakování izolovaného SQL testu (vyžaduje PostgreSQL binaries):

```sh
bash scripts/test-repertoire-isolated.sh
```

Script založí a odstraní vlastní dočasný cluster; nedotýká se existující DB.

Mobilní browser kontrola prošla u všech 76 detailů (11 pásem + 65 koled),
včetně porovnání vykresleného obsahu, zalamování, skrytí poznámek a admin editoru.
`npm run check` prošel se 126 testy. Produkční migrace a import 11 pásem / 65 koled byly ověřeny dry-runem s rollbackem
a porovnáním všech uložených bloků proti privátním importům. Běžných 57 písní
zůstává bez dodaných textů. Release vychází z publikované verze `8d10bf2`
a neobsahuje souběžnou úpravu dialogu párů a stavů akcí.
