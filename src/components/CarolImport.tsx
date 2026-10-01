import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { parseCarolImport, importCarolTexts, type SongTextImport } from '../lib/programTexts';
import { databaseQueryKey } from './DataContext';
import { Button } from './Ui';
export function CarolImport() {
  const query = useQueryClient();
  const [draft,setDraft] = useState<SongTextImport | null>(null);
  const [error,setError] = useState('');
  const [success,setSuccess] = useState('');
  const upload = useMutation({ mutationFn: importCarolTexts, onSuccess: async () => {
    setDraft(null); setSuccess('Koledy včetně textů byly importovány.');
    await query.invalidateQueries({queryKey: databaseQueryKey});
    await query.invalidateQueries({queryKey: ['song-text']});
  } });
  return <section className="program-import">
    <h3>Import zpěvníku</h3><p>Vyberte převedený JSON. Existující texty se nepřepíší.</p>
    <input type="file" aria-label="Soubor s koledami" accept=".json,application/json" disabled={upload.isPending} onChange={async e => {
      const file=e.target.files?.[0]; e.target.value=''; setDraft(null); setError(''); setSuccess(''); upload.reset();
      if (!file) return;
      try { if(file.size>5_000_000) throw new Error('Soubor je příliš velký.'); setDraft(parseCarolImport(await file.text())); }
      catch(err) {setError(err instanceof Error ? err.message : 'Soubor nelze načíst.');}
    }} />
    {draft && <><p>Připraveno {draft.songs.length} koled: {draft.songs.map(s=>s.name).join(', ')}.</p><Button loading={upload.isPending} onClick={()=>upload.mutate(draft)}>Importovat koledy a texty</Button></>}
    {(error || upload.error) && <p role="alert" className="form-error">{error || upload.error?.message}</p>}
    {success && <p role="status">{success}</p>}
  </section>;
}
