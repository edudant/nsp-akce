import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SongSeriesPanel } from '../components/SongSeriesPanel';
import type { AppDatabase, EnsembleEvent } from '../lib/domain';
import { TextsPage } from './TextsPage';
import { ProgramTextPage } from './ProgramTextPage';
import { SongTextPage } from './SongTextPage';
import { parseCarolImport, parseProgramImport } from '../lib/programTexts';
const mocks=vi.hoisted(()=>({deleteProgram:vi.fn(),getProgramText:vi.fn(),getSongText:vi.fn(),saveProgramText:vi.fn(),saveSongText:vi.fn(),navigate:vi.fn()}));
vi.mock('../lib/programTexts',async original=>({...await original<typeof import('../lib/programTexts')>(), ...mocks}));
vi.mock('../components/Router',async original=>({...await original<typeof import('../components/Router')>(),navigate:mocks.navigate}));
vi.mock('../components/DataContext',()=>({databaseQueryKey:['database'],useViewMode:()=>({scope:'test',memberPreview:false}),useDatabase:()=>({data:{programCatalog:[{id:'p',name:'Strašidla',active:true,sortOrder:1}],songs:[{id:'s',name:'Obyčejná píseň',kind:'song',active:true},{id:'c',name:'Koleda',kind:'carol',active:true,hasText:true},{id:'hidden',name:'Skrytá koleda',kind:'carol',active:false}]}})}));
const blocks=[{kind:'heading',text:'Název'},{kind:'text',text:'První řádek\nDruhý řádek',notes:'TIŠE'},{kind:'note',text:'Předehra'}];
function show(element:React.ReactNode){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{element}</QueryClientProvider>);}
beforeEach(()=>{vi.clearAllMocks();mocks.getProgramText.mockResolvedValue({blocks,updatedAt:'stamp'});mocks.getSongText.mockResolvedValue({blocks,updatedAt:'stamp',sourcePages:[3]});mocks.saveProgramText.mockResolvedValue(undefined);mocks.deleteProgram.mockResolvedValue(undefined);});
afterEach(cleanup);
describe('Repertoire texts',()=>{
 it('confirms admin deletion and keeps an in-use error visible',async()=>{
  mocks.deleteProgram.mockRejectedValue(new Error('Pásmo je použité v programu akce.'));
  show(<ProgramTextPage id="p" canEdit/>);
  const action=await screen.findByRole('button',{name:'Smazat pásmo'});
  expect(action.querySelector('svg')).not.toBeNull();
  fireEvent.click(action);
  expect(mocks.deleteProgram).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole('button',{name:'Smazat pásmo'}).at(-1)!);
  expect(await screen.findByRole('alert')).toHaveTextContent('Pásmo je použité');
  expect(mocks.deleteProgram).toHaveBeenCalledWith('p');
  expect(mocks.navigate).not.toHaveBeenCalled();
 });
 it('offers only carols in the song picker of a carol event',()=>{
  show(<SongSeriesPanel db={{songs:[{id:'s',name:'Běžná píseň',active:true,kind:'song'},{id:'c',name:'Vánoční koleda',active:true,kind:'carol'}]} as AppDatabase} event={{id:'e',seasonKind:'carols',songSeries:[]} as unknown as EnsembleEvent} admin/>);
  fireEvent.click(screen.getByRole('button',{name:'Přidat koledy'}));
  expect(screen.getByLabelText('Vánoční koleda')).toBeInTheDocument();expect(screen.queryByLabelText('Běžná píseň')).not.toBeInTheDocument();
 });
 it('separates songs and carols, filters hidden items, and opens a shared detail',()=>{
  show(<TextsPage section="koledy" canEdit={false}/>);
  expect(screen.getByText('Koleda')).toBeInTheDocument();expect(screen.queryByText('Obyčejná píseň')).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Přidat koledu'})).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Aktivita textů'),{target:{value:'all'}});expect(screen.getByText('Skrytá koleda')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Řazení textů'),{target:{value:'reverse'}});expect(screen.getAllByRole('button')[0]).toHaveAccessibleName('Detail: Skrytá koleda');
  fireEvent.click(screen.getByRole('button',{name:"Detail: Koleda"}));expect(mocks.navigate).toHaveBeenCalledWith('/pisne/c');
 });
 it('searches without accents',()=>{
  show(<TextsPage section="pasma" canEdit={false}/>);fireEvent.change(screen.getByLabelText('Hledat text'),{target:{value:'strasidla'}});expect(screen.getByText('Strašidla')).toBeInTheDocument();
 });
 it('preserves lyrics when notes are hidden, without member edit controls',async()=>{
  show(<ProgramTextPage id="p" canEdit={false}/>);await screen.findByText('TIŠE');
  fireEvent.click(screen.getByLabelText('Zobrazit poznámky'));expect(screen.queryByText('TIŠE')).not.toBeInTheDocument();expect(screen.queryByText('Předehra')).not.toBeInTheDocument();
  expect(screen.getByText(/První řádek/)).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Upravit texty'})).not.toBeInTheDocument();
 });
 it('saves an admin edit against the loaded version',async()=>{
  show(<ProgramTextPage id="p" canEdit/>);await screen.findByText('TIŠE');fireEvent.click(screen.getByRole('button',{name:'Upravit texty'}));
  fireEvent.change(screen.getByLabelText('Text bloku 2'),{target:{value:'Opravená sloka'}});fireEvent.click(screen.getByRole('button',{name:'Uložit texty'}));
  await vi.waitFor(()=>expect(mocks.saveProgramText).toHaveBeenCalledWith('p',expect.arrayContaining([expect.objectContaining({text:'Opravená sloka',notes:'TIŠE'})]),'stamp'));
 });
 it('shows the missing text state for an ordinary song',async()=>{
  mocks.getSongText.mockResolvedValue(null);show(<SongTextPage id="s" canEdit={false}/>);expect(await screen.findByText('Text této písně zatím není doplněný.')).toBeInTheDocument();
 });
 it('validates imports and rejects duplicate names and malformed notes',()=>{
  const item={name:'Koleda',kind:'carol',source:'Zpěvník.pdf',sourcePages:[3],blocks};
  expect(parseCarolImport(JSON.stringify({version:1,songs:[item]})).songs).toHaveLength(1);
  expect(()=>parseCarolImport(JSON.stringify({version:1,songs:[item,item]}))).toThrow();
  expect(()=>parseProgramImport(JSON.stringify({version:1,programs:[{name:'Pásmo',blocks:[{kind:'text',text:'Text',notes:123}]}]}))).toThrow();
 });
});
