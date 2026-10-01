"""Convert supplied carol PDF to private application JSON using pdfplumber."""
import sys, json, re, collections, pathlib
import pdfplumber
source=pathlib.Path(sys.argv[1]); output=pathlib.Path(sys.argv[2] if len(sys.argv)>2 else '.local/carols.json')
programs=[]; by_name={}; duplicate_pages=[]
clean=lambda s:re.sub(r'[ \t]+',' ',s.replace('\u00a0',' ')).strip()
with pdfplumber.open(source) as pdf:
 for page_no,page in enumerate(pdf.pages,1):
  lines=page.extract_text_lines()
  if not lines: continue
  title=clean(lines[0]['text']); name=title.split(':',1)[-1].strip()
  # Performance qualifiers are retained as notes, not part of the catalogue name.
  name=re.sub(r'\s+–\s+ä capälla$','',name)
  blocks=[{'kind':'heading','text':title}]
  retained=[title]
  previous_bottom=lines[0]['bottom']
  right_column=[]
  left_column=[]
  for line in lines[1:]:
   full=clean(line['text']); retained.append(full)
   # Page 48 has an independent parallel lyric column, not stage directions.
   if page_no==48 and line['top']<270:
    left=clean(''.join(c['text'] for c in sorted(line['chars'],key=lambda c:c['x0']) if c['x0']<330))
    right=clean(''.join(c['text'] for c in sorted(line['chars'],key=lambda c:c['x0']) if c['x0']>=330))
    if left: left_column.append(left)
    if right: right_column.append(right)
    previous_bottom=line['bottom'];continue
   if right_column:
    blocks.append({'kind':'note','text':left_column[0]})
    blocks.append({'kind':'text','text':'\n'.join(left_column[1:])})
    blocks.append({'kind':'text','text':'\n'.join(right_column),'notes':'Pravý sloupec originálu (Hdy je zima)'})
    right_column=[]
   # Short marginal singing cues often share the same PDF line with lyrics.
   match=re.search(r'\s+(ŽENY|MUŽÍ|MUŽI|ŠICHNÍ|SBOR|SÓLO|TIŠE, ALE VČAS ☺|TIŠE, ZVONKY|TIŠE|ZVONKY|ZTYŘI)$',full)
   note=match[1] if match else None
   text=full[:match.start()].strip() if match else full
   kind='note' if re.match(r'^(předehra|mezihra|dohra|doprovod|2 takty|Sbor odpovídá|\(?ä cäpella|\(?ä capälla)',text,re.I) or (text.upper()==text and re.search(r'[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]',text) and not text.startswith(('[:','/:'))) else 'text'
   b={'kind':kind,'text':text}
   if note: b['notes']=note
   last=blocks[-1]
   if kind=='text' and last['kind']=='text' and not note and not last.get('notes') and line['top']-previous_bottom<22:
    last['text']+='\n'+text
   else: blocks.append(b)
   previous_bottom=line['bottom']
  # Compare extracted content independently of changed line/column order.
  chars=lambda s:collections.Counter(re.sub(r'\s','',s))
  target=''.join(b['text']+('' if b.get('notes')=='Pravý sloupec originálu (Hdy je zima)' else b.get('notes','')) for b in blocks)
  if chars(''.join(retained))!=chars(target): raise ValueError(f'Obsah nesouhlasí, strana {page_no}')
  item={'name':name,'kind':'carol','source':source.name,'sourcePages':[page_no],'blocks':blocks}
  if name in by_name:
   original=by_name[name]
   if original['blocks']!=blocks: raise ValueError(f'Odlišná varianta koledy {name}')
   original['sourcePages'].append(page_no);duplicate_pages.append(page_no)
  else: programs.append(item);by_name[name]=item
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps({'version':1,'songs':programs},ensure_ascii=False,indent=2)+'\n')
print(f'{len(programs)} koled; duplicitní strany {duplicate_pages}; obsah všech neprázdných stran ověřen')
