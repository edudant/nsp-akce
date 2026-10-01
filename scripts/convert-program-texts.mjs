// macOS Word import. Originals and generated JSON stay outside the public repo.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
const input = process.argv[2] || path.join(os.homedir(), 'Downloads');
const output = process.argv[3] || '.local/program-texts.json';
const names = {
  'Bláhoviny': 'Bláhoviny', 'Svarba ráno': 'Chodská svatba',
  'Kolečka': 'Kolečka', 'POSTŘEKOVINY': 'Postřekoviny',
  'PRHOHŮDKY_A_VORAČKY': 'Prohůdky ha voračky', 'Posvícení': 'Posvícení',
  'Strašidla': 'Strašidla', 'Travničky': 'Travničky', 'Volání': 'Volání',
  'Zednický': 'Zednický', 'Zelený kúsky': 'Zelený kousky',
  'postřekovo': 'Postřekovo', 'Židovka': 'Židovka',
};
const clean = (s) => s.replace(/[\u00a0\u202f]/g, ' ').replace(/[\u2028\u2029\f]/g, '\n').replace(/\uF04A/g, '☺').replace(/[^\S\n]+/g, ' ').trim();
const compact = (s) => clean(s).replace(/\s/g, '');
const result = [];
for (const [stem, name] of Object.entries(names)) {
  const files = (await fs.readdir(input)).filter(f => f === `${stem} - texty.doc` || f === `${stem} - texty.docx`);
  if (!files.length) continue;
  if (files.length !== 1) throw new Error(`Více verzí: ${stem}`);
  const source = files[0];
  const html = execFileSync('textutil', ['-convert', 'html', '-stdout', path.join(input, source)], { encoding: 'utf8' });
  const document = new JSDOM(html).window.document;
  document.querySelectorAll('br').forEach(e => e.replaceWith('\n'));
  const uniformItalic = ['Travničky', 'Zelený kousky', 'Strašidla'].includes(name);
  const blocks = [];
  const retained = [];
  let boundary = true;
  let weddingDialogue = false;
  for (const p of document.querySelectorAll('body p, body li')) {
    const raw = p.textContent;
    const full = clean(raw);
    if (!full || /^-+$/.test(full)) { boundary = true; continue; }
    if (/^(?:-?\s*PAGE\s+\d+\s*-?|FILENAME\s+.*\s+PAGE\s+\d+)$/i.test(full)) continue;
    retained.push(full);
    let text = full;
    let notes;
    let kind = 'text';
    const italic = [...(uniformItalic ? [] : p.querySelectorAll('i'))].map(e => e.textContent).join('');
    if (compact(italic) === compact(raw)) kind = 'note';
    else if (name === 'Prohůdky ha voračky' && p.className === 'p3') kind = /["„“]/.test(full) ? 'dialogue' : 'note';
    else {
      // Word uses tabs as side columns. Keep their cues on the same block.
      const columns = raw.split(/\t+/).map(clean).filter(Boolean);
      if (columns.length > 1 && name !== 'Prohůdky ha voračky') {
        text = columns[0]; notes = columns.slice(1).join(' · ');
      } else if (italic.trim()) {
        const copy = p.cloneNode(true);
        copy.querySelectorAll('i').forEach(e => e.replaceWith(' '));
        text = clean(copy.textContent);
        notes = clean(italic);
      }
      if (/^(?:Hančička|Hančika|Honza|Honzíček|Dodla|kecal|Ch\d*|D|Staryj|Kapelník|jinyj chlapec)\b.*[:.]/i.test(text)) kind = 'dialogue';
    }
    if (name === 'Chodská svatba') {
      // Tabs here separate speakers from spoken lines, not stage directions.
      text = full; notes = undefined; kind = 'text';
      if (/bouření|vorevřú dveře/.test(full)) { weddingDialogue = true; kind = 'note'; }
      else {
        if (/^Vítám já Tě pan ženichu/.test(full)) weddingDialogue = false;
        if (weddingDialogue || /^[„“"]/.test(full)) kind = 'dialogue';
        const cue = text.match(/^\(([^)]+)\)\s*/);
        if (cue && kind === 'dialogue') { notes = cue[0].trim(); text = text.slice(cue[0].length); }
      }
    }
    if (!blocks.length || (name === 'Strašidla' && p.querySelector('.s1') && full.length < 80) || full === 'Hádka o sólo') kind = 'heading';
    if (kind === 'note') {
      const columns = raw.split(/\t+/).map(clean).filter(Boolean);
      if (columns.length > 1) { text = columns[0]; notes = columns.slice(1).join(' · '); }
    }
    const emphasis = [...p.querySelectorAll('b')].map(e => clean(e.textContent)).filter(phrase => phrase && text.includes(phrase));
    const block = { kind, text, spaceBefore: boundary, ...(notes ? { notes } : {}), ...(emphasis.length ? { emphasis } : {}) };
    // Merge adjacent lyric lines into stanzas; never cross a cue or blank line.
    const previous = blocks.at(-1);
    if (!boundary && kind === 'text' && !notes && previous?.kind === 'text' && !previous.notes) { previous.text += '\n' + text; if (emphasis.length) previous.emphasis = [...(previous.emphasis ?? []), ...emphasis]; }
    else blocks.push(block);
    boundary = false;
  }
  // Every non-layout character must survive extraction, including inline notes.
  const sourceChars = [...compact(retained.join(''))].sort().join('');
  const targetChars = [...compact(blocks.map(b => b.text + (b.notes ?? '').replace(/ · /g, '')).join(''))].sort().join('');
  if (sourceChars !== targetChars) throw new Error(`Ztráta obsahu: ${source}`);
  result.push({ name, source, blocks });
  console.log(`${name}: ${blocks.length} bloků, ${blocks.filter(b => b.kind === 'note' || b.notes).length} poznámek — obsah ověřen`);
}
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify({ version: 1, programs: result }, null, 2) + '\n');
