import { requireSupabase } from './supabase';
export type ProgramTextBlock = { kind: 'heading' | 'text' | 'note' | 'dialogue'; text: string; notes?: string; spaceBefore?: boolean; emphasis?: string[] };
export type ProgramText = { blocks: ProgramTextBlock[]; source?: string; updatedAt: string };
export type ProgramTextImport = { version: 1; programs: { name: string; source?: string; blocks: ProgramTextBlock[] }[] };
export function validateBlocks(value: unknown): asserts value is ProgramTextBlock[] {
  if (!Array.isArray(value) || !value.length || value.length > 2000 || value.some(b => !b || !['heading', 'text', 'note', 'dialogue'].includes(b.kind) || typeof b.text !== 'string' || !b.text.trim() || b.text.length > 20000 || (b.notes !== undefined && (typeof b.notes !== 'string' || b.notes.length > 20000)) || (b.spaceBefore !== undefined && typeof b.spaceBefore !== 'boolean') || (b.emphasis !== undefined && (!Array.isArray(b.emphasis) || b.emphasis.some((phrase: unknown) => typeof phrase !== 'string' || phrase.length > 20000))))) throw new Error('Neplatný formát textů pásma.');
}
export function parseProgramImport(text: string): ProgramTextImport {
  const data = JSON.parse(text);
  if (data.version !== 1 || !Array.isArray(data.programs) || !data.programs.length || data.programs.length > 100) throw new Error('Neplatný soubor pásem.');
  const names = new Set<string>();
  for (const p of data.programs) {
    if (!p || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 120 || names.has(p.name.trim().toLocaleLowerCase('cs')) || (p.source !== undefined && (typeof p.source !== 'string' || p.source.length > 255))) throw new Error('Neplatný nebo duplicitní název pásma.');
    names.add(p.name.trim().toLocaleLowerCase('cs'));
    validateBlocks(p.blocks);
  }
  return data;
}
export async function getProgramText(id: string): Promise<ProgramText | null> {
  const { data, error } = await requireSupabase().rpc('get_program_text', { program_id: id });
  if (error) throw error;
  return data;
}
export async function saveProgramText(id: string, blocks: ProgramTextBlock[], expectedUpdatedAt: string | null) {
  validateBlocks(blocks);
  const { error } = await requireSupabase().rpc('save_program_text', { program_id: id, new_blocks: blocks, expected_updated_at: expectedUpdatedAt });
  if (error) throw error;
}
export async function importProgramTexts(data: ProgramTextImport) {
  const { error } = await requireSupabase().rpc('import_program_texts', { documents: data.programs });
  if (error) throw error;
}
export type SongTextImport = { version: 1; songs: { name: string; kind: 'carol'; source: string; sourcePages: number[]; blocks: ProgramTextBlock[] }[] };
export function parseCarolImport(text: string): SongTextImport {
  const data = JSON.parse(text);
  if (data.version !== 1 || !Array.isArray(data.songs) || !data.songs.length || data.songs.length > 200) throw new Error('Neplatný soubor koled.');
  const names = new Set<string>();
  for (const song of data.songs) {
    if (!song || song.kind !== 'carol' || typeof song.name !== 'string' || !song.name.trim() || song.name.length > 250 || names.has(song.name.trim().toLocaleLowerCase('cs')) || typeof song.source !== 'string' || song.source.length > 255 || !Array.isArray(song.sourcePages) || !song.sourcePages.length || song.sourcePages.some((p: unknown) => typeof p !== 'number' || !Number.isInteger(p) || p < 1)) throw new Error('Neplatná nebo duplicitní koleda.');
    names.add(song.name.trim().toLocaleLowerCase('cs')); validateBlocks(song.blocks);
  }
  return data;
}
export async function importCarolTexts(data: SongTextImport) {
  const { error } = await requireSupabase().rpc('import_carol_texts', { documents: data.songs });
  if (error) throw error;
}
export async function getSongText(id: string): Promise<(ProgramText & { sourcePages: number[] }) | null> {
  const { data, error } = await requireSupabase().rpc('get_song_text', { song_id: id });
  if (error) throw error;
  return data;
}
export async function saveSongText(id: string, blocks: ProgramTextBlock[], expectedUpdatedAt: string | null) {
  validateBlocks(blocks);
  const { error } = await requireSupabase().rpc('save_song_text', { song_id: id, new_blocks: blocks, expected_updated_at: expectedUpdatedAt });
  if (error) throw error;
}
