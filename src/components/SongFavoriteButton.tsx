import { Star } from "lucide-react";
import { IconButton } from "./Ui";

export function SongFavoriteButton({
  name,
  favorite,
  disabled,
  onToggle,
}: {
  name: string;
  favorite: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <IconButton
      label={`${favorite ? "Odebrat z oblíbených" : "Přidat do oblíbených"}: ${name}`}
      className={`song-favorite ${favorite ? "is-favorite" : ""}`}
      aria-pressed={favorite}
      disabled={disabled}
      onClick={onToggle}
    >
      <Star aria-hidden="true" fill={favorite ? "currentColor" : "none"} />
    </IconButton>
  );
}
