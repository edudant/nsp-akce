import { TextReaderControls } from "../components/TextReaderControls";
import { useTextSize } from "../lib/useTextSize";
import { TextBlocks } from "../components/TextBlocks";
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, FilePenLine, Trash2, Save, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import { useDatabase, useViewMode, databaseQueryKey } from '../components/DataContext';
import { AppLink, navigate } from '../components/Router';
import { PageHeader } from '../components/PageHeader';
import { Card, Button, IconButton, Dialog, Select } from '../components/Ui';
import { ErrorState, LoadingState } from '../components/DataStates';
import { RepertoireEditor } from "../components/RepertoireEditor";
import { deleteProgram, getProgramText, saveProgramText, importProgramTexts, parseProgramImport, type ProgramTextBlock, type ProgramText } from '../lib/programTexts';

export function ProgramTextPage({ id, canEdit }: { id: string; canEdit: boolean }) {
  const db = useDatabase();
  const query = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const remove = useMutation({ mutationFn: () => deleteProgram(id), onSuccess: async () => {
    await query.invalidateQueries({ queryKey: databaseQueryKey });
    query.removeQueries({ queryKey: ["program-text"] });
    navigate("/texty/pasma");
  } });
  const { scope, memberPreview } = useViewMode();
  const text = useQuery({ queryKey: ['program-text', scope, memberPreview, id], queryFn: () => getProgramText(id) });
  const [showNotes, setShowNotes] = useState(true);
  const [textSize, setTextSize] = useTextSize();
  const [editing, setEditing] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const item = db.data?.programCatalog?.find(p => p.id === id);
  if (db.isPending || text.isPending) return <LoadingState label="Načítám texty pásma…" />;
  if (db.error || text.error) return <ErrorState message={db.error?.message || text.error?.message} onRetry={() => { void db.refetch(); void text.refetch(); }} />;
  if (!item) return <ErrorState title="Pásmo nebylo nalezeno" />;
  const hasNotes = text.data?.blocks.some(b => b.kind === 'note' || b.notes);
  return <div className="page">
    <AppLink to="/texty/pasma" className="back-link"><ArrowLeft aria-hidden="true" /> Všechna pásma</AppLink>
    <PageHeader title={item.name} actions={canEdit ? <><IconButton label="Upravit pásmo" onClick={() => setEditingName(true)}><Pencil aria-hidden="true" /></IconButton><IconButton label="Upravit texty" onClick={() => setEditing(true)}><FilePenLine aria-hidden="true" /></IconButton><IconButton label="Smazat pásmo" onClick={() => { remove.reset(); setDeleting(true); }}><Trash2 aria-hidden="true" /></IconButton></> : undefined} />
    {text.data ? <>
      <TextReaderControls hasNotes={Boolean(hasNotes)} showNotes={showNotes} onShowNotes={setShowNotes} textSize={textSize} onTextSize={setTextSize} />
      {text.data.source?.startsWith('Strašidla') && <p className="program-source-note">Zdrojový dokument má nadpis „Daremný pjí­sničky“. Text je ponechán podle originálu.</p>}
      <Card className="program-reader" style={{ fontSize: `${textSize}px` }}>
        <TextBlocks blocks={text.data.blocks} showNotes={showNotes} />
      </Card>
      {text.data.source && <p className="program-source-note">Zdroj: {text.data.source}</p>}
    </> : <Card><p>Texty tohoto pásma zatím nejsou doplněné.</p></Card>}
    <Dialog open={deleting && canEdit} title="Smazat pásmo" onClose={() => { if (!remove.isPending) setDeleting(false); }}>
      <p>Smazat pásmo „{item.name}“ včetně textů? Tuto změnu nelze vrátit.</p>
      <p>Pásmo použité v programu akce nelze smazat. Můžete ho skrýt přes „Upravit pásmo“ vypnutím nabídky na nových akcích.</p>
      <div className="feature-toolbar"><Button variant="secondary" disabled={remove.isPending} onClick={() => setDeleting(false)}>Zrušit</Button><Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}><Trash2 aria-hidden="true" /> Smazat pásmo</Button></div>
      {remove.error && <p role="alert" className="form-error">{remove.error.message}</p>}
    </Dialog>
    <Dialog open={editingName && canEdit} title="Upravit pásmo" onClose={() => setEditingName(false)}>{editingName && canEdit && <RepertoireEditor kind="program" item={item} onSaved={() => setEditingName(false)} />}</Dialog>
    <Dialog open={editing && canEdit} title="Upravit texty pásma" onClose={() => setEditing(false)}>
      {editing && canEdit && <TextEditor key={text.data?.updatedAt ?? id} id={id} initial={text.data ?? null} onSaved={() => setEditing(false)} />}
    </Dialog>
  </div>;
}
export function TextEditor({ id, initial, onSaved, saveText = saveProgramText, queryKey = "program-text" }: { id: string; initial: ProgramText | null; onSaved: () => void; saveText?: typeof saveProgramText; queryKey?: string }) {
  const query = useQueryClient();
  const [blocks, setBlocks] = useState<ProgramTextBlock[]>(initial?.blocks ?? [{ kind: 'text', text: '' }]);
  const save = useMutation({ mutationFn: () => saveText(id, blocks, initial?.updatedAt ?? null), onSuccess: async () => {
    await query.invalidateQueries({ queryKey: [queryKey] });
    await query.invalidateQueries({ queryKey: databaseQueryKey }); onSaved();
  } });
  const change = (index: number, patch: Partial<ProgramTextBlock>) => setBlocks(old => old.map((b,i) => i === index ? {...b, ...patch} : b));
  return <form className="dialog-form" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
    <p>Každý blok je sloka, dialog, nadpis nebo poznámka. Řádky sloky oddělujte Enterem.</p>
    <fieldset disabled={save.isPending} className="program-editor">
      {blocks.map((b,i) => <div key={i} className="program-editor-block">
        <Select aria-label={`Typ bloku ${i+1}`} value={b.kind} onChange={e => change(i, {kind: e.target.value as ProgramTextBlock['kind']})}>
          <option value="text">Text / sloka</option><option value="heading">Nadpis</option><option value="dialogue">Dialog</option><option value="note">Poznámka</option>
        </Select>
        <textarea aria-label={`Text bloku ${i+1}`} required rows={Math.min(8, Math.max(3, b.text.split('\n').length))} maxLength={20000} value={b.text} onChange={e => change(i, {text: e.target.value})} />
        <textarea aria-label={`Poznámka bloku ${i+1}`} placeholder="Poznámka k tomuto bloku" rows={2} maxLength={20000} value={b.notes ?? ''} onChange={e => change(i,{ notes: e.target.value || undefined })} />
        <div className="feature-toolbar">
          <Button size="small" variant="ghost" disabled={i===0} onClick={() => setBlocks(old => { const next=[...old]; [next[i-1],next[i]]=[next[i],next[i-1]]; return next; })}><ArrowUp aria-hidden="true" /> Nahoru</Button>
          <Button size="small" variant="ghost" disabled={i===blocks.length-1} onClick={() => setBlocks(old => { const next=[...old]; [next[i+1],next[i]]=[next[i],next[i+1]]; return next; })}><ArrowDown aria-hidden="true" /> Dolů</Button>
          <Button size="small" variant="danger" disabled={blocks.length===1} onClick={() => setBlocks(old => old.filter((_,index) => i!==index))}><Trash2 aria-hidden="true" /> Odebrat blok</Button>
        </div>
      </div>)}
      <Button variant="secondary" onClick={() => setBlocks(old => [...old, {kind:'text',text:''}])}><Plus aria-hidden="true" /> Přidat blok</Button>
    </fieldset>
    <Button type="submit" loading={save.isPending} disabled={blocks.some(b => !b.text.trim())}><Save aria-hidden="true" /> Uložit texty</Button>
    {save.error && <p role="alert" className="form-error">{save.error.message}</p>}
  </form>;
}

export function ProgramImport() {
  const query = useQueryClient();
  const [draft, setDraft] = useState<ReturnType<typeof parseProgramImport> | null>(null);
  const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  const upload = useMutation({ mutationFn: importProgramTexts, onSuccess: async () => {
    setDraft(null); setSuccess("Texty pásem byly importovány.");
    await query.invalidateQueries({ queryKey: ["program-text"] });
  } });
  return <section><h2>Import textů pásem</h2><p>Vyberte převedený JSON. Existující texty import nepřepíše.</p>
    <input type="file" accept=".json,application/json" aria-label="Soubor s texty pásem" disabled={upload.isPending} onChange={async e => {
      const file=e.target.files?.[0];e.target.value="";setDraft(null);setError("");setSuccess("");upload.reset();
      if(!file)return;
      try {if(file.size>5_000_000)throw new Error("Soubor je příliš velký.");setDraft(parseProgramImport(await file.text()));}
      catch(err){setError(err instanceof Error?err.message:"Soubor nelze načíst.");}
    }} />
    {draft && <><p>Připraveno {draft.programs.length} pásem: {draft.programs.map(p=>p.name).join(", ")}.</p><Button loading={upload.isPending} onClick={()=>upload.mutate(draft)}>Importovat texty</Button></>}
    {(error || upload.error) && <p role="alert" className="form-error">{error || upload.error?.message}</p>}
    {success && <p role="status">{success}</p>}
  </section>;
}
