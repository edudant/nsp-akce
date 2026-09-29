import { Check, HelpCircle, Minus, X, type LucideIcon } from "lucide-react";
import { useId } from "react";
import type { InterestStatus } from "../lib/domain";
import { interestLabels } from "../lib/domain";
// eslint-disable-next-line react-refresh/only-export-components
export const responseChoices = [
  { value: "yes", label: "Přijdu", Icon: Check },
  { value: "no", label: "Nepřijdu", Icon: X },
  { value: "maybe", label: "Zatím nevím", Icon: HelpCircle },
] as const;
export function ResponseBadge({ response }: { response: InterestStatus }) {
  const Icon =
    responseChoices.find((choice) => choice.value === response)?.Icon ?? Minus;
  return (
    <span className={`response-badge response-badge--${response}`}>
      <Icon aria-hidden="true" />
      {interestLabels[response]}
    </span>
  );
}
export function ChoiceButtons<T extends string>({
  label,
  value,
  choices,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  choices: readonly { value: T; label: string; Icon?: LucideIcon }[];
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="choice-buttons" disabled={disabled}>
      <legend className="sr-only">{label}</legend>
      {choices.map((choice) => (
        <label
          key={choice.value}
          className={`choice--${choice.value} ${choice.value === value ? "is-selected" : ""}`}
        >
          <input
            className="sr-only"
            type="radio"
            name={name}
            value={choice.value}
            checked={value === choice.value}
            onChange={() => onChange(choice.value)}
          />
          {choice.Icon && <choice.Icon aria-hidden="true" />}
          {choice.label}
        </label>
      ))}
    </fieldset>
  );
}
