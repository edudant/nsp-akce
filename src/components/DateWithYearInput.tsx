import { useState } from "react";

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function yearFromIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(0, 4) : "";
}

function replaceIsoDateYear(value: string, year: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match || year < MIN_YEAR || year > MAX_YEAR) return value;

  const month = Number(match[2]);
  const day = Number(match[3]);
  const lastDayInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return [
    year.toString().padStart(4, "0"),
    match[2],
    Math.min(day, lastDayInMonth).toString().padStart(2, "0"),
  ].join("-");
}

export function DateWithYearInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [year, setYear] = useState(() => yearFromIsoDate(value));

  const changeDate = (nextValue: string) => {
    setYear(yearFromIsoDate(nextValue));
    onChange(nextValue);
  };

  const changeYear = (nextValue: string) => {
    setYear(nextValue);
    if (!/^\d{4}$/.test(nextValue)) return;

    const numericYear = Number(nextValue);
    if (numericYear < MIN_YEAR || numericYear > MAX_YEAR) return;
    onChange(replaceIsoDateYear(value, numericYear));
  };

  return (
    <div className="date-with-year-input">
      <input
        id={id}
        onChange={(event) => changeDate(event.target.value)}
        type="date"
        value={value}
      />
      <span className="date-with-year-input__year">
        <label htmlFor={`${id}-year`}>Rok</label>
        <input
          autoComplete="off"
          id={`${id}-year`}
          inputMode="numeric"
          max={MAX_YEAR}
          min={MIN_YEAR}
          onChange={(event) => changeYear(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          required={Boolean(value)}
          type="number"
          value={year}
        />
      </span>
    </div>
  );
}
