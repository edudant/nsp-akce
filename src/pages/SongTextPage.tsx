import { TextReaderControls } from "../components/TextReaderControls";
import { useTextSize } from "../lib/useTextSize";
import { TextBlocks } from "../components/TextBlocks";
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDatabase, useViewMode } from '../components/DataContext';
import { AppLink } from '../components/Router';
import { PageHeader } from '../components/PageHeader';
import { Card, Button, Dialog } from '../components/Ui';
import { ErrorState, LoadingState } from '../components/DataStates';
import { getSongText, saveSongText } from '../lib/programTexts';
import { RepertoireEditor } from '../components/RepertoireEditor';
import { TextEditor } from './ProgramTextPage';
export function SongTextPage({id, canEdit}: {id:string;canEdit:boolean}) {
  const db=useDatabase(); const {scope,memberPreview}=useViewMode();
  const text=useQuery({queryKey:['song-text',scope,memberPreview,id],queryFn:()=>getSongText(id)});
  const [showNotes,setShowNotes]=useState(true); const [textSize,setTextSize]=useTextSize(); const [editing,setEditing]=useState(false); const [editingName,setEditingName]=useState(false);
  const song=db.data?.songs?.find(s=>s.id===id);
  if(db.isPending || text.isPending) return <LoadingState label="Načítám text…" />;
  if(db.error || text.error) return <ErrorState message={db.error?.message || text.error?.message} onRetry={()=>{void db.refetch();void text.refetch();}} />;
  if(!song) return <ErrorState title="Píseň nebyla nalezena" />;
  return <div className="page">
    <AppLink className="back-link" to={song.kind==='carol'?'/texty/koledy':'/texty/pisne'}>Zpět na seznam</AppLink>
    <PageHeader title={song.name} eyebrow={song.kind==='carol'?'Koleda':'Píseň'} actions={canEdit ? <><Button variant="secondary" onClick={()=>setEditingName(true)}>Upravit údaje</Button><Button variant="secondary" onClick={()=>setEditing(true)}>Upravit text</Button></> : undefined} />
    {text.data ? <>
      <TextReaderControls hasNotes={text.data.blocks.some(b => b.kind === 'note' || Boolean(b.notes))} showNotes={showNotes} onShowNotes={setShowNotes} textSize={textSize} onTextSize={setTextSize} />
      <Card className="program-reader" style={{ fontSize: `${textSize}px` }}>
        <TextBlocks blocks={text.data.blocks} showNotes={showNotes} />
      </Card>
      <p className="program-source-note">Zdroj: {text.data.source}{text.data.sourcePages?.length ? ` · strany ${text.data.sourcePages.join(', ')}` : ''}</p>
    </> : <Card><p>Text této písně zatím není doplněný.</p></Card>}
    <Dialog open={editingName && canEdit} title="Upravit údaje" onClose={()=>setEditingName(false)}>{editingName && canEdit && <RepertoireEditor kind={song.kind ?? "song"} item={song} onSaved={()=>setEditingName(false)} />}</Dialog>
    <Dialog open={editing && canEdit} title="Upravit text" onClose={()=>setEditing(false)}>
      {editing && canEdit && <TextEditor id={id} initial={text.data ?? null} saveText={saveSongText} queryKey="song-text" onSaved={()=>setEditing(false)} />}
    </Dialog>
  </div>;
}
