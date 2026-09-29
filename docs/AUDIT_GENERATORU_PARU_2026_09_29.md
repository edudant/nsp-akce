# Audit generátoru párů (29. 9. 2026)

Porovnání zadání `ZADANI_SEZONY_UCAST_A_PAROVANI.md` a uživatelských upřesnění
s verzí `0dc707d`. Kontrola kódu a reprodukce se syntetickými daty; nebyla
provedena kontrola konkrétní produkční akce. Audit nemění generátor ani data.

## Potvrzené problémy

### 1. Nepřítomný člen se může dostat do páru

`src/lib/seasonPairing.ts:90` filtruje pouze `active`, `selected` a `standing`.
Ignoruje skutečnou účast `absent`/`excused`. UI v `PairingPage.tsx:97` tyto
stavy filtruje, takže generátor a ruční editor používají odlišný seznam.
Změna skutečné účasti sama neaktualizuje `selected`; synchronizace probíhá
při uzavření akce. Reprodukce: vybraný nepřítomný muž + přítomná žena vytvoří
pár bez upozornění. `validatePairs` stav skutečné účasti také neověřuje.

### 2. Rozdělení skupin může zbytečně nechat členy bez páru

`seasonPairing.ts:243` zkouší jen dvě pořadí skupin. V každé skupině vytvoří
úplné párování, vezme první páry podle odhadu a jejich členy definitivně
odebere. Následující kroky již volbu neopravují. Samotný základní solver je
maximum-cardinality/minimum-cost; postup nad ním tuto vlastnost nezachová.

Ověřený případ bez zákazů, seed `8`, odhad 1 Starý + 1 Mladý:

| Člen | Role | Zařazení                      |
| ---- | ---- | ----------------------------- |
| 0    | muž  | Starý + Mladý, priorita Starý |
| 1    | muž  | Mladý                         |
| 2    | muž  | Starý                         |
| 3    | žena | Mladý                         |
| 4    | žena | Starý                         |
| 5    | žena | Starý                         |

Výsledek: 0–3 Mladý, 2–5 Starý; 1 a 4 bez páru, žádné upozornění.
Platné řešení: 1–3 Mladý, 2–4 Starý, 0–5 Starý pod čarou.
Třetí pár existuje, ale generátor ho nenajde. Reprodukce byla nalezena
nezávislým úplným výčtem kombinací pro šest členů.

### 3. Doplnění Mladých ze Starých neumí přesunout již spárovaného člena

`seasonPairing.ts:276` doplňuje pouze dosud nespárované členy. Pokud dual
člen dostane Starý pár v první fázi, už ho nelze přesunout do Mladých.
Příklad zkoušky: muži A (obě skupiny, priorita Starý) a D (Starý), ženy B
(Starý) a C (Mladý), seed `4`. Výsledek A–B; C a D stojí.
Platné řešení D–B a A–C vytvoří dva páry. Zapnuté doplnění tedy nemusí pomoci,
ačkoliv kompatibilní doplnění existuje.

### 4. Nepotvrzená historie se započítává jako stání

`seasonPairing.ts:175` počítá stání jako přítomnost bez potvrzeného
skutečného páru. Nerozlišuje zaznamenané stání od chybějící evidence párů.
Uzavřené vystoupení bez potvrzených skutečných párů tak přidá stání všem
přítomným. Reprodukce: pouhé přidání takové historie změní vybraného muže
z B na A, ačkoliv skutečné stání nikdo nezapsal. Pole `actualStanding`
generátor při výpočtu vůbec nepoužívá.

### 5. Ochrana před opakovaným stáním není napojená

Základní solver používá `lastByeAt` pro `consecutiveByeAvoidance`, ale
adaptér předává jen `byeCount`. Váha se nastavuje, datum se nikdy nepředá.
U dvou mužů se stejným počtem stání a nové partnerky poslední stojící
v 10 z 20 seedů stojí znovu i při Střídání = 3. Pořadí stání nemá vliv.

## Co odpovídá zadání

| Požadavek                                                                 | Stav                                    |
| ------------------------------------------------------------------------- | --------------------------------------- |
| Muž–žena, společná skupina, zákazy a žádné duplicity                      | Odpovídá pro automaticky vytvořené páry |
| Starý-only nedoplní Mladé                                                 | Odpovídá                                |
| Random zkouška bez bodů, přání, zkušenosti a historie                     | Odpovídá; problém je přidělení skupin   |
| Body zesilují přání, nikoliv podobnost bodů partnerů                      | Odpovídá                                |
| Vybírají holky / kluci filtruje směrová přání                             | Odpovídá                                |
| Body a historie ze sezóny akce; zkouškové sady nejsou historií vystoupení | Odpovídá                                |
| Podpora začátečník + zkušený                                              | Zapojená jako vážená preference         |
| Explicitní stání                                                          | Vyřazuje člena z generování             |
| Jedna sestava na celé vystoupení                                          | Odpovídá                                |
| Ruční úpravy, draft a zveřejnění, více zkouškových sad                    | Implementováno                          |
| Koledy bez párování                                                       | Odpovídá                                |
| Odhady a další páry pod čarou                                             | Jen částečně; viz problém 2             |

UI navíc zahodí rozpracované ruční změny po změně checkboxu „kdo má stát“
(`PairingPage.tsx:93`). Solver vrací vysvětlení párů, ale adaptér je zahodí;
admin tak nemá u výsledku vysvětlení splněných a nesplněných pravidel.

## Ověření a doporučené opravy

37 existujících testů v `pairing.test.ts` a `seasonPairing.test.ts` prošlo.
Výše uvedené hraniční případy nepokrývají. Reprodukce:

```sh
node docs/audit-pairing-2026-09.mjs
npm test -- src/lib/pairing.test.ts src/lib/seasonPairing.test.ts
```

Priorita oprav:

1. Sjednotit vstup přítomných pro generátor, editor i validaci ukládání.
2. Řešit skupiny, cílové počty a páry pod čarou společně, včetně přesunu
   dual členů; teprve potom optimalizovat preference a ostatní váhy.
3. Historii stání číst z potvrzené evidence a předávat datum posledního stání.
4. Doplnit regresní scénáře z auditu a vysvětlení výsledku v UI.

## Dokončené opravy

- Společný integer model řeší obě skupiny a hlavní sestavu/páry pod čarou.
  Pořadí cílů: naplnit odhady, spárovat co nejvíce členů, optimalizovat tuning.
  Používá [YALPS](https://github.com/IanManske/YALPS) 0.6.4, výpočet běží
  ve workeru a má časový limit s viditelným upozorněním.
- U uzavřených akcí jsou vstupem skutečně přítomní/částečně přítomní, i bez
  starého `selected` a včetně bývalých členů. Před uzavřením platí admin výběr.
  Nepřítomné/omluvené a explicitní stání vyřazuje generátor i server při uložení.
- Doplnění Mladých umí přesunout dual člena; historie používá `actualStanding`
  a předává `lastByeAt`. Regenerovaná akce neovlivňuje vlastní historii/body.
- Prázdný výsledek i chyba mají vysvětlení. Návrh zobrazuje počty a admin
  důvody párů; změna stání nezahazuje ostatní ruční úpravy.
- Reprodukce z auditu jsou regresní testy; další test porovnává 81 konfigurací
  skupin a zákazů s nezávislým úplným výčtem.

Migrace: `20260929160000_pairing_reality_and_history.sql`.
Původní nálezy výše popisují stav před opravou.
