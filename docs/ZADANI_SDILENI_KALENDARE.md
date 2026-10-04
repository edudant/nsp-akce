# Zadání: odběr akcí do osobních kalendářů

Implementovat v projektu `/Users/bubak/soubor/nsp-akce`. Respektovat AGENTS.md a zachovat existující rozpracované změny. Implementovat a lokálně ověřit; produkční nasazení není součástí zadání.

## Požadavky
- Na stránce Akce přidat „Přidat do kalendáře“.
- Aktivní přihlášený člen získá osobní tajnou URL pro odběr všech akcí / jen zkoušek / jen vystoupení.
- Každý typ má samostatný odkaz s možností zneplatnění a náhrady.
- Společný přístup funkci nenabízí. Admin ji používá jako člen, pokud má účet propojený s aktivním členem.
- Obsah: posledních 12 měsíců a všechny budoucí akce napříč sezónami, viditelné běžnému členovi; bez draftů.
- Název obsahuje aktuální odpověď, např. „[Přijdu] Páteční zkouška“. Chybějící odpověď: „Bez odpovědi“.
- Popis obsahuje poznámku k akci, vlastní odpověď, případnou změnu adminem a odkaz do aplikace. Použít stejnou logiku odpovědi jako aktuální aplikace. Osobní poznámku k odpovědi neexportovat.
- Neexportovat ostatní členy, jejich odpovědi, docházku ani párování.
- Zrušené zveřejněné akce ponechat se stejným UID, prefixem „Zrušeno“ a STATUS:CANCELLED.
- Odběr je read-only; bez zápisu zpět a bez přidaných reminders.

## Technické řešení
- React frontend na GitHub Pages, backend Supabase.
- Tabulka odběrů: vlastník účtu a člen, typ, hash náhodného 256bitového tokenu, data vytvoření/zneplatnění. Nejvýše jeden aktivní odběr na účet a typ.
- Autentizované RPC: seznam metadat, vytvoření/náhrada a zneplatnění vlastního odběru. Přímý přístup k tabulce zakázat.
- Token vrátit pouze při vytvoření. Dialog nabídne kopírování URL. Pozdější náhrada upozorní na nutnost znovu přidat odběr.
- Edge Function `calendar-feed`: GET/HEAD `?token=…`, `verify_jwt=false`, vlastní ověření tokenu. DB projekce jen pro serverovou roli.
- Při každém stažení ověřit aktivního člena a aktuální propojení účtu. Neplatný token vrací obecnou chybu bez dat. Backendová chyba nesmí vrátit prázdný úspěšný feed.
- `text/calendar; charset=utf-8` podle RFC 5545: stabilní UID podle ID akce, DB časy v UTC, čas změny zahrnující odpověď, escaping, CRLF a UTF-8 line folding.
- Tokeny nelogovat ani neposílat do analytiky; žádná veřejná cache.
- HTTPS URL, `webcal://`, stručné návody Google Calendar, Apple Calendar, Outlook. Vysvětlit odběr oproti importu a že rychlost aktualizace řídí osobní kalendář.

## Ověření a provoz
- SQL testy oprávnění, izolace vlastníků, náhrady a zneplatnění, deaktivace člena a změny propojení účtu.
- Feed testy filtrů, období, draftů, odpovědí člena/admina, zrušení, stabilního UID, změn obsahu, diakritiky a DST.
- UI testy dialogu a chyb, `npm run check`, backendové integrační testy.
- Pokud lze, ověřit skutečný odběr a aktualizaci Google/Apple/Outlook; jinak přesně uvést neověřené scénáře.
- Doplnit provozní dokumentaci a nasazení: migrace a Edge Function před frontendem podle existujícího zálohovaného DB release postupu.
