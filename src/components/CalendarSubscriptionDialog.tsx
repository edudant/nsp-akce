import { useEffect, useState } from 'react';
import { CalendarDays, ExternalLink } from 'lucide-react';
import { calendarSubscriptions, type SubscriptionKind, type SubscriptionMetadata } from '../lib/calendarSubscriptions';
import { Button, Dialog } from './Ui';

const kinds = [['all', 'Všechny akce'], ['rehearsal', 'Jen zkoušky'], ['performance', 'Jen vystoupení']] as const;
const googleCalendarUrl = 'https://calendar.google.com/calendar/u/0/r/settings/addbyurl';

export function CalendarSubscriptionDialog({ onClose }: { onClose: () => void }) {
  const [metadata, setMetadata] = useState<SubscriptionMetadata[]>([]);
  const [urls, setUrls] = useState<Partial<Record<SubscriptionKind, string>>>({});
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [replacement, setReplacement] = useState<SubscriptionKind>();

  useEffect(() => {
    let alive = true;
    calendarSubscriptions.list().then(data => {
      if (alive) { setMetadata(data); setReady(true); }
    }).catch(() => {
      if (alive) setError('Odběry se nepodařilo načíst. Zavřete dialog a zkuste to znovu.');
    });
    return () => { alive = false; };
  }, []);

  async function change(kind: SubscriptionKind, revoke: boolean) {
    setBusy(true); setError(''); setNotice('');
    try {
      if (revoke) {
        await calendarSubscriptions.revoke(kind);
        setUrls(old => ({ ...old, [kind]: undefined }));
      } else {
        const url = await calendarSubscriptions.create(kind);
        setUrls(old => ({ ...old, [kind]: url }));
      }
      setReplacement(undefined);
      // The URL lives only in this mounted dialog, never in query cache or storage.
      setMetadata(await calendarSubscriptions.list());
    } catch {
      setError('Změna odběru se nepodařila. Ověřte stav opětovným otevřením dialogu.');
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string, google = false) {
    setError(''); setNotice('');
    try {
      await navigator.clipboard.writeText(url);
      setNotice(google
        ? 'Odkaz zkopírován. V otevřeném Google Kalendáři ho vložte do pole „Adresa URL kalendáře“ a klikněte na „Přidat kalendář“.'
        : 'Odkaz zkopírován. Teď ho můžete vložit do svého kalendáře.');
    } catch {
      setError('Kopírování se nepodařilo. Označte a zkopírujte odkaz ručně.');
    }
  }

  return <Dialog open title="Přidat do kalendáře" onClose={onClose}>
    <p>Akce souboru můžete mít vedle svých ostatních schůzek v telefonu nebo počítači. Vyberte, které akce chcete, a klikněte na „Získat odkaz“.</p>
    <p>V kalendáři se zobrazí i vaše odpověď, například „Přijdu“. Nové akce a změny se doplňují automaticky. Někdy to trvá i několik hodin; rychlost určuje váš kalendář.</p>
    <p>Odkaz si nechte pro sebe. Kdo ho získá, uvidí vaše akce a odpovědi.</p>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!ready && !error && <p>Načítám odběry…</p>}
    {kinds.map(([kind, title]) => {
      const active = metadata.find(item => item.kind === kind && !item.revokedAt);
      const url = urls[kind];
      return <section key={kind} className="calendar-subscription">
        <h3>{title}</h3>
        {active && <p>{active.linked ? 'Odkaz je platný' : 'Odkaz už neodpovídá vašemu členskému účtu'} · vytvořen {new Date(active.createdAt).toLocaleString('cs-CZ')}</p>}
        {url && <div>
          <a className="button button--primary button--medium" href={googleCalendarUrl}
            target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
            onClick={() => void copy(url, true)}>
            <CalendarDays aria-hidden="true" />
            Zkopírovat a otevřít Google Kalendář
            <ExternalLink aria-hidden="true" />
          </a>
          <p>V Google Kalendáři vložte odkaz do pole „Adresa URL kalendáře“ a klikněte na „Přidat kalendář“. Tím je hotovo.</p>
          <label>Váš odkaz pro kalendář
            <input aria-label={`${title} odkaz pro kalendář`} readOnly value={url} onFocus={e => e.target.select()} />
          </label>
          <Button onClick={() => void copy(url)} variant="secondary">Zkopírovat odkaz</Button>
          <details>
            <summary>Další možnost pro Apple a jiné kalendáře</summary>
            <label>Odkaz pro aplikaci kalendáře
              <input aria-label={`${title} odkaz pro aplikaci kalendáře`} readOnly value={url.replace(/^https:/, 'webcal:')} onFocus={e => e.target.select()} />
            </label>
            <Button onClick={() => void copy(url.replace(/^https:/, 'webcal:'))} variant="secondary">Zkopírovat odkaz pro aplikaci</Button>
          </details>
          <p>Odkaz si zkopírujte před zavřením tohoto okna. Později ho znovu nezobrazíme; můžete si vytvořit nový.</p>
        </div>}
        <div className="button-row">
          <Button disabled={!ready || busy} onClick={() => active ? setReplacement(kind) : void change(kind, false)} variant="secondary">
            {active ? `Vytvořit nový odkaz: ${title}` : `Získat odkaz: ${title}`}
          </Button>
          {active && <Button disabled={busy} variant="secondary" onClick={() => void change(kind, true)}>Zrušit odkaz: {title}</Button>}
        </div>
        {replacement === kind && <div role="alert">
          <p>Původní odkaz přestane fungovat. Nový odběr musíte znovu přidat do osobního kalendáře a starý odebrat.</p>
          <Button disabled={busy} onClick={() => void change(kind, false)}>Vytvořit nový odkaz</Button>
          <Button disabled={busy} variant="secondary" onClick={() => setReplacement(undefined)}>Ponechat původní odkaz</Button>
        </div>}
      </section>;
    })}
    <h3>Google Kalendář</h3>
    <ol>
      <li>Na počítači zde získejte odkaz pro vybrané akce.</li>
      <li>Klikněte na „Zkopírovat a otevřít Google Kalendář“. Pokud vás Google požádá, přihlaste se ke svému účtu.</li>
      <li>Do pole „Adresa URL kalendáře“ vložte zkopírovaný odkaz (Ctrl+V, na Macu Cmd+V) a klikněte na „Přidat kalendář“.</li>
    </ol>
    <p>Akce pak uvidíte i v mobilní aplikaci Google Kalendář pod stejným účtem. Samotné přidání odběru se dělá v prohlížeči na počítači, v mobilní aplikaci tuto možnost Google nenabízí.</p>
    <p>Pokud se správná stránka neotevře, v Google Kalendáři vlevo u „Jiné kalendáře“ klikněte na + a vyberte „Pomocí adresy URL“.</p>
    <details>
      <summary>Apple Kalendář</summary>
      <ol>
        <li>Zde klikněte na „Zkopírovat odkaz“.</li>
        <li>Na Macu otevřete Kalendář a v menu zvolte Soubor → Nový odběr kalendáře.</li>
        <li>Vložte odkaz a potvrďte odběr. Můžete si vybrat, jak často se má kalendář aktualizovat.</li>
      </ol>
    </details>
    <details>
      <summary>Outlook</summary>
      <ol>
        <li>Zde klikněte na „Zkopírovat odkaz“.</li>
        <li>V Outlooku na webu otevřete Kalendář → Přidat kalendář → Přihlásit se k odběru z webu.</li>
        <li>Vložte odkaz, pojmenujte si kalendář a potvrďte přidání.</li>
      </ol>
    </details>
    <details>
      <summary>Co se přenáší a jak fungují změny?</summary>
      <p>Zobrazí se zveřejněné akce za posledních 12 měsíců a všechny budoucí akce. Účast dál měňte v aplikaci souboru. Úpravy v osobním kalendáři se do aplikace souboru nepřenášejí a upozornění na akce automaticky nezapínáme.</p>
      <p>Zvolte přidání pomocí odkazu podle návodu výše. Pouhé stažení a import souboru je jednorázová kopie, která se později sama neaktualizuje.</p>
    </details>
  </Dialog>;
}
