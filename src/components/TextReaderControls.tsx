export function TextReaderControls({ hasNotes, showNotes, onShowNotes, textSize, onTextSize }: {
  hasNotes: boolean;
  showNotes: boolean;
  onShowNotes: (value: boolean) => void;
  textSize: number;
  onTextSize: (value: number) => void;
}) {
  return <div className="program-reader-controls">
    {hasNotes && <label className="program-notes-toggle">
      <input type="checkbox" checked={showNotes} onChange={event => onShowNotes(event.target.checked)} />
      Zobrazit poznámky
    </label>}
    <label className="program-text-size">
      <span>Velikost textu <output>{textSize} px</output></span>
      <input aria-label="Velikost textu" type="range" min={15} max={26} step={1} value={textSize} onChange={event => onTextSize(Number(event.target.value))} />
    </label>
  </div>;
}
