# Úpravy přihlášení, účasti, sezón, párování a písní

Upřesněné zadání podle dohody z 28. 9. 2026. Při rozporu má toto zadání
přednost před původní specifikací. Dokument popisuje požadované změny;
nepotvrzuje jejich implementaci ani nasazení.

## Přihlášení

- Admin může u člena vygenerovat jednorázový přihlašovací kód.
- Člen musí mít evidovaný e-mail. Přístup k jeho schránce není pro použití
  adminem vygenerovaného kódu nutný.
- Admin může kód předat členovi nebo ho použít k přihlášení v jiném okně.
  Není požadováno přepínání identity v adminově session.
- Kód smí získat pouze admin; platnost a jednorázové použití vynucuje backend.

## Členové a skupiny

- Člen může být Starý, Mladý nebo mít obě zařazení.
- Při obou zařazeních má jednu prioritní skupinu. Generátor preferuje tuto
  skupinu, podle potřeby může využít druhou.
- Člen označený pouze jako Starý nesmí doplnit Mladé.
- Pár tvoří muž a žena ve stejné skupině. Dvojí členství umožňuje zařazení
  do kterékoliv z obou skupin, nikoliv účast ve dvou párech současně.
- Hodnocení zkušenosti i interní poznámka jsou dostupné pouze adminovi.
  Člen nesmí vidět ani vlastní hodnocení zkušenosti. Ochrana platí i pro API,
  databázové dotazy a přehledy, nejen pro UI.

## Zkoušky

- Výchozí místo je Stará škola, termín pátek 19:00–21:00.
- Datum, začátek, konec a místo lze změnit.
- Zkouška neeviduje program, odhad počtu párů ani přání partnerů.
- Člen odpovídá pouze ano/ne. Odpověď smí měnit, dokud admin událost neuzavře,
  tedy i po jejím začátku.
- Admin po začátku přepne událost na Uzavřená. Při uzavření se skutečná účast
  předvyplní podle odpovědí ano/ne. Chybějící odpověď zůstane nezapsaná.
- Již zapsaná skutečná účast se při uzavření nepřepíše.
- Admin může upravit skutečnou účast včetně procenta částečné účasti.

### Adminův seznam účastníků a výběr pro páry

- Hlavní seznam zobrazuje pouze členy vybrané pro konkrétní zkoušku,
  s jejich účastí a případným procentem. Celý seznam členů se nezobrazuje
  jako dlouhý seznam k proklikávání.
- Akce „Přidat člena“ otevře seznam všech aktivních členů, kteří ještě
  nejsou vybraní. Členy lze rychle vyhledat podle jména a postupně přidávat.
- Vybraného člena lze odebrat. Úprava seznamu nesmí smazat jeho předběžnou
  odpověď ani historii; případná změna skutečné účasti musí být explicitní.
- Vyhledávání podle jména a přepnutí řazení „Aktivita / Jméno“ jsou dostupné
  v hlavním seznamu i při přidávání členů. Řazení podle jména je abecední.
- Výchozí řazení je podle aktivity: počet skutečně absolvovaných zkoušek
  v aktivní sezóně sestupně, při shodě poslední skutečná účast a poté jméno.
  Celá i částečná účast se pro toto řazení počítají jako absolvovaná zkouška;
  samotná odpověď ano se nezapočítává. Členové bez účasti jsou dole.
- Přehled ukazuje počet vybraných členů a stručný údaj o aktivitě, aby bylo
  řazení srozumitelné.
- Generátor zkouškových párů používá tento výběr přítomných členů;
  nevyžaduje druhé nezávislé vybírání z celého seznamu. Změna výběru
  nepřepisuje dříve uložené sady párů.

## Vystoupení

- Odpovědi jsou ano/ne/zatím nevím. Pro zatím nevím je povinná poznámka.
- Termín pro vyjádření je povinný a obsahuje datum i čas.
- Po deadlinu se událost automaticky přepne do stavu Potvrzená a odpovědi
  i přání partnerů smí upravovat pouze admin.
- Zatím nevím i chybějící odpovědi se zachovají; rozhodnutí udělá admin.
- Před potvrzením vidí ne-admin vlastní odpověď, nikoliv odpovědi ostatních.
  Od potvrzení vidí seznam účasti. Platí také pro společný přístup ke čtení.
- Odhad počtu párů se zadává za celé vystoupení, zvlášť Starý a Mladý.
  Generátor na něj cílí pro hlavní sestavu. Další kompatibilní páry vytvoří
  také, ale zobrazí je odděleně „pod čarou“.
- Člen může zadávat přání kompatibilních partnerů: opačné pohlaví a společné
  zařazení. Přání nesmí obejít explicitní zákaz dvojice.
- Návrh, ruční úpravy a zveřejnění párů jsou oddělené kroky. Ostatní vidí
  pouze zveřejněný výsledek.
- Skutečně odtančené páry a členové, kteří stáli, se evidují pouze
  u tanečních vystoupení.

## Sezóny a body

- Admin v nastavení zakládá a spravuje sezóny ručně a označí aktivní sezónu.
- Sezóny mají název, typ (Taneční / Koledy) a období. Taneční a koledová
  sezóna se mohou časově překrývat.
- Pro nabídku nových událostí je aktivní sezóna určena zvlášť pro každý typ.
- Každá událost patří právě do jedné sezóny. Koledové události se současně
  nezapočítávají do taneční sezóny.
- Taneční sezóna končí po Chodských slavnostech; slavnosti patří do končící
  sezóny. Skutečnou hranici nastavuje admin, není pevně daná 10. srpnem.
- Nová sezóna začíná s nulovým součtem, historické body zůstávají uložené.
- Koledy mají zkoušky i vystoupení. U koledových vystoupení nejsou páry,
  přání partnerů ani odhady počtu párů; slouží pro evidenci účasti a bodů.
- Body jsou za skutečnou účast na zkoušce i vystoupení. Plná účast získá
  bodovou váhu zadanou u události, částečná `váha × procento / 100`.
- Procento zadává admin. Předběžná odpověď sama o sobě nepřiděluje body.
- Všichni vidí body všech členů. Výchozí přehled ukazuje aktivní taneční
  sezónu; lze vybrat Koledy, minulou sezónu nebo vlastní období.
- Filtr období nepřepisuje přiřazení událostí do sezón.
- Stávající události a jejich body se zachovají; přiřazení do sezón je
  potřeba zkontrolovat při migraci.

## Generátor pro zkoušky

- Vychází ze skutečně přítomných členů zvolených adminem.
- Párování je random, bez vlivu bodů, zkušenosti, přání či historie.
- Vždy respektuje pohlaví, zařazení a explicitní zákazy dvojic.
- Volba doplnit Mladé ze Starých je výchozí zapnutá. Umožňuje přesunout
  členy s oběma zařazeními, nikoliv členy označené pouze jako Starý.
- Lze uložit více vygenerovaných sad k jedné zkoušce a zobrazit je členům.
- Sady nejsou evidencí skutečně odtančených párů ani stání a neovlivňují
  historii používanou při generování vystoupení.

## Generátor pro vystoupení

- Generuje jednu sestavu pro celé vystoupení, nikoliv jednotlivé tance.
- Admin vybírá dostupné členy a může výslovně určit, kdo má stát po celé
  vystoupení.
- Posuvníky nastavují vliv preferencí, bodů, střídání a kombinace
  začátečníků se zkušenými. Tvrdá omezení zůstávají závazná.
- Body slouží jako odměna: vyšší počet bodů zvyšuje váhu přání člena.
  Posuvník bodů určuje sílu tohoto zvýhodnění. Nejde o hledání podobně
  bodovaných partnerů ani o vyrovnávání součtů bodů jednotlivých párů.
- Volba vybírají holky / kluci určuje, čí přání generátor zohlední.
  Bodové zvýhodnění se vztahuje k přáním zohledňované strany.
- Body, historie párů a historie stání se berou ze stejné taneční sezóny
  jako vystoupení. Výchozí nová událost používá aktivní sezónu.
- Koledy se pro párování nepoužívají.
- Výsledek lze ručně upravit před zveřejněním. Ruční změna musí respektovat
  stejné tvrdé podmínky jako generátor.
- Hlavní sestava cílí zvlášť na odhad Starých a Mladých párů. Všichni další
  dostupní kompatibilní členové se také spárují a jejich páry se zobrazí
  „pod čarou“. Člen je v celé sestavě nejvýše v jednom páru.
- Admin může před zveřejněním upravit i zařazení páru nad/pod čáru.
- Pár pod čarou není automaticky potvrzený skutečně odtančený pár;
  skutečná účast, páry a stání se evidují podle průběhu vystoupení.
- Při nedostatku kompatibilních partnerů generátor ukáže zbývající stojící
  a nesmí potichu porušit zákaz nebo zařazení.

## Katalog písní a série na událostech

- Admin spravuje katalog písní v settings: přidání, úprava názvu a skrytí
  položky z nabídky pro nové série. Použití ve starších událostech se zachová.
- V settings spravuje také kategorie písní a přiřazuje do nich písně.
  Kategorie slouží pro přehled a filtrování při výběru písní do série;
  samy se do série jako píseň nepřidávají. Píseň může zůstat bez kategorie.
- Výchozím zdrojem je příloha „Dudácká NSP.docx“. Její 59 neprázdných položek
  obsahuje 57 položek písní a dvě kategorie. Vyčištěné názvy jsou
  v [seznamu pro import](KATALOG_PISNI_NSP.md). Znění nářečních názvů se zachová.
- U zkoušky i vystoupení, včetně Koled, lze označit „Bude se zpívat“.
- Na události lze vytvořit více pojmenovaných sérií. Po vytvoření série
  admin přidává písně z katalogu, odebírá je a upravuje jejich pořadí.
- Nabídka umožňuje vyhledávání v celém dostupném katalogu. Píseň použitá
  v kterékoliv sérii stejné události se už nenabízí, včetně použití v návrhu.
- Stejná píseň nesmí být na jedné události ve více sériích ani dvakrát
  v jedné sérii. Na jiné události ji lze použít znovu.
- Po odebrání ze série se píseň opět nabídne pro danou událost.
- Nová série je návrh dostupný pouze adminovi. Admin ji samostatně potvrdí;
  až potom se zobrazí všem členům i ve společném přístupu ke čtení.
- Potvrzení série je nezávislé na potvrzení události a zveřejnění párů.
- Písně a série nemění body, účast ani pravidla párování.

### Pravidla importu katalogu

- Každá z trojice položek s lomítky je jedna nedělitelná kombinace.
  V katalogu i při kontrole duplicit se bere jako jedna položka.
- „legrůtský“ a „majstrštyky“ se založí jako kategorie, nikoliv písně.
  Přiřazení konkrétních písní se neodhaduje podle pořadí v příloze;
  admin je může doplnit v settings.
- Importují se pouze názvy. Texty „nešla“ a „byla univerzálka, nejde líp?“
  i značky `⁰` a koncové `6` se ignorují; neukládají se ani jako poznámky.

## Kontextová nápověda v aplikaci

- Každá netriviální funkce má přímo u příslušné části UI dostupný help
  s popisem významu, pravidel a výsledku akce. Nápověda je součástí aplikace,
  čtenář nepotřebuje externí dokumentaci.
- Krátké vysvětlení je u ovládacího prvku; podrobnosti lze rozbalit přes
  „Jak to funguje“ nebo tlačítko nápovědy. Help funguje na mobilu i klávesnicí,
  není dostupný pouze přes hover.
- Bodování vysvětluje váhu události, skutečnou účast, procentuální krácení
  s příkladem výpočtu, uzavření události, aktivní sezónu, oddělení Koled
  a dopad filtrů období. Předběžná odpověď nepřiděluje body.
- Generátor pro zkoušky vysvětluje výběr přítomných, random párování,
  prioritní skupinu, doplnění Mladých, explicitní zákazy a ukládání více sad.
- Generátor pro vystoupení vysvětluje každý posuvník, bodové zvýhodnění
  přání, volbu vybírají holky / kluci, střídání v rámci sezóny, zkušenost,
  explicitní stání, cílový odhad párů a páry pod čarou.
- Help rozlišuje tvrdá omezení od preferencí a popisuje, proč některé
  přání nemusí být splněno nebo proč někdo zůstane bez páru.
- Nápověda dále pokrývá dvojí zařazení člena, řazení podle aktivity,
  předvyplnění účasti při uzavření, deadline a zamknutí odpovědí,
  generování přihlašovacího kódu, kategorie písní, zákaz duplicit v sériích
  a potvrzování sérií i zveřejnění párů.
- Ne-adminům help nevypisuje soukromá hodnocení zkušenosti, interní poznámky
  ani neveřejné návrhy. Popisuje pravidla, která se vztahují k jejich pohledu.

## Technické podmínky ověření

- Přihlašovací kód ověřit i v jiném prohlížeči a po jednorázovém použití.
- Kontrolovat oprávnění pro admina, členský účet i společný přístup.
- Automatické potvrzení a zamknutí odpovědí musí fungovat bez otevřené
  aplikace a při souběhu zápisu s deadlinem.
- Ověřit předvyplnění docházky, procentuální body, překryv sezón,
  kompatibilitu dvojího zařazení a oddělení zkouškových sad od historie.
- Ověřit bodové zvýhodnění přání a rozdělení hlavní sestavy a párů
  pod čarou bez duplicitních členů.
- Ověřit přidání, odebrání, vyhledávání a obě řazení účastníků zkoušky,
  návaznost výběru na generátor a zachování odpovědí i uložených sad.
- Ověřit unikátnost písní napříč sériemi téže události i při souběžném
  přidání, opětovnou nabídku po odebrání a dostupnost na jiné události.
- Ověřit, že návrh série neuniká ne-adminům přes UI ani API a že potvrzenou
  sérii vidí členské účty i společný přístup.
- Ověřit import 57 názvů a dvou kategorií bez poznámek a značek, zachování
  kombinací s lomítky a filtrování písní podle kategorie.
- Ověřit dostupnost kontextového helpu na mobilu i klávesnicí a shodu
  popsaných pravidel bodování a generátorů s jejich skutečným chováním.
