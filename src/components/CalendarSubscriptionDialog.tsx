import { useEffect, useState } from 'react';
import { calendarSubscriptions, type SubscriptionKind, type SubscriptionMetadata } from '../lib/calendarSubscriptions';
import { Button, Dialog } from './Ui';
const kinds = [['all', 'Všechny akce'], ['rehearsal', 'Jen zkoušky'], ['performance', 'Jen vystoupení']] as const;
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
    calendarSubscriptions.list().then(data => { if (alive) { setMetadata(data); setReady(true); } }).catch(() => { if (alive) setError('Odběry se nepodařilo načíst. Zavřete dialog a zkuste to znovu.'); });
    return () => { alive = false; };
  }, []);
  async function change(kind: SubscriptionKind, revoke: boolean) {
    setBusy(true); setError(''); setNotice('');
    try {
      if (revoke) { await calendarSubscriptions.revoke(kind); setUrls(old => ({ ...old, [kind]: undefined })); }
      else { const url = await calendarSubscriptions.create(kind); setUrls(old => ({ ...old, [kind]: url })); }
      setReplacement(undefined);
      // The URL lives only in this mounted dialog, never in query cache or storage.
      setMetadata(await calendarSubscriptions.list());
    } catch { setError('Změna odběru se nepodařila. Ověřte stav opětovným otevřením dialogu.'); }
    finally { setBusy(false); }
  }
  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); setNotice('Odkaz zkopírován.'); }
    catch { setError('Kopírování se nepodařilo. Označte a zkopírujte odkaz ručně.'); }
  }
  return <Dialog open title="Přidat do kalendáře" onClose={onClose}>
    <p>Odběr průběžně aktualizuje akce a vaši odpověď. Import souboru je jednorázový. Rychlost aktualizace řídí osobní kalendář; změny se mohou projevit se zpožděním.</p>
    <p>Odkazy jsou tajné: kdokoli s odkazem uvidí vaše akce a odpovědi. Odběr zahrnuje posledních 12 měsíců a všechny budoucí zveřejněné akce napříč sezónami. Je read-only a nepřidává reminders.</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!ready && !error && <p>Načítám odběry…</p>}
    {kinds.map(([kind, title]) => {
      const active = metadata.find(item => item.kind === kind && !item.revokedAt);
      const url = urls[kind];
      return <section key={kind} className="calendar-subscription">
        <h3>{title}</h3>
        {active && <p>{active.linked ? 'Aktivní odběr' : 'Odběr má neplatné propojení účtu'} · vytvořen {new Date(active.createdAt).toLocaleString('cs-CZ')}</p>}
        {url && <div>
          <label>HTTPS URL<input aria-label={`${title} HTTPS URL`} readOnly value={url} onFocus={e => e.target.select()} /></label>
          <Button onClick={() => void copy(url)} variant="secondary">Kopírovat HTTPS URL</Button>
          <label>webcal URL<input aria-label={`${title} webcal URL`} readOnly value={url.replace(/^https:/, 'webcal:')} onFocus={e => e.target.select()} /></label>
          <Button onClick={() => void copy(url.replace(/^https:/, 'webcal:'))} variant="secondary">Kopírovat webcal URL</Button>
          <p>Odkaz je zobrazen pouze nyní. Po zavření dialogu jej nelze znovu získat; lze vytvořit náhradu.</p>
        </div>}
        <div className="button-row">
          <Button disabled={!ready || busy} onClick={() => active ? setReplacement(kind) : void change(kind, false)} variant="secondary">{active ? `Nahradit: ${title}` : `Vytvořit: ${title}`}</Button>
          {active && <Button disabled={busy} variant="secondary" onClick={() => void change(kind, true)}>Zneplatnit: {title}</Button>}
        </div>
        {replacement === kind && <div role="alert">
          <p>Původní odkaz přestane fungovat. Nový odběr musíte znovu přidat do osobního kalendáře a starý odebrat.</p>
          <Button disabled={busy} onClick={() => void change(kind, false)}>Potvrdit náhradu</Button>
          <Button disabled={busy} variant="secondary" onClick={() => setReplacement(undefined)}>Ponechat odkaz</Button>
        </div>}
      </section>;
    })}
    <h3>Jak přidat odběr</h3>
    <ul>
      <li>Google Calendar: ve webové verzi vedle „Jiné kalendáře“ zvolte + → „Z adresy URL“ a vložte HTTPS URL.</li>
      <li>Apple Calendar: Soubor → Nový odběr kalendáře; vložte HTTPS nebo webcal URL. Vyberte interval automatické aktualizace.</li>
      <li>Outlook: Přidat kalendář → Přihlásit se k odběru z webu; vložte HTTPS URL.</li>
    </ul>
  </Dialog>;
}
