import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { appApi } from '../lib/dataApi';
import type { ProgramCatalogItem, Song } from '../lib/domain';
import { databaseQueryKey } from './DataContext';
import { Button, Field } from './Ui';
export function RepertoireEditor({ kind, item, onSaved }: { kind: 'program' | 'song' | 'carol'; item?: ProgramCatalogItem | Song; onSaved: (id?: string) => void }) {
  const query=useQueryClient();
  const [name,setName]=useState(item?.name ?? ''); const [active,setActive]=useState(item?.active ?? true);
  const [sortOrder,setSortOrder]=useState(item && 'sortOrder' in item ? item.sortOrder : 0);
  const save=useMutation({mutationFn:async()=>{
    if(kind==='program') return (await appApi.saveProgramCatalogItem({id:item?.id,name,active,sortOrder})).id;
    await appApi.saveSong({ id:item?.id,name,active,kind, categoryId:item && 'categoryId' in item ? item.categoryId : undefined });
    if (item?.id) return item.id;
    return (await appApi.getDatabase()).songs?.find(s => s.name === name.trim() && (s.kind ?? "song") === kind)?.id;
  },onSuccess:async id=>{await query.invalidateQueries({queryKey:databaseQueryKey});onSaved(id);}});
  return <form className="dialog-form" onSubmit={e=>{e.preventDefault();save.mutate();}}>
    <Field label="Název"><input aria-label="Název" required maxLength={kind==='program'?120:250} value={name} disabled={save.isPending} onChange={e=>setName(e.target.value)} /></Field>
    {kind==='program' && <Field label="Pořadí"><input aria-label="Pořadí" type="number" min={0} required value={sortOrder} disabled={save.isPending} onChange={e=>setSortOrder(Number(e.target.value))} /></Field>}
    <label><input type="checkbox" checked={active} disabled={save.isPending} onChange={e=>setActive(e.target.checked)} /> Nabízet na nových akcích</label>
    <Button type="submit" disabled={!name.trim()} loading={save.isPending}>{item?'Uložit':'Přidat'}</Button>
    {save.error && <p role="alert" className="form-error">{save.error.message}</p>}
  </form>;
}
