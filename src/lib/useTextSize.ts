import { useEffect, useState } from "react";
const storageKey = "nsp-text-size";
export function useTextSize() {
  const [textSize, setTextSize] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(storageKey));
      return stored >= 15 && stored <= 26 ? stored : 18;
    } catch { return 18; }
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, String(textSize)); } catch { /* Reading works even if browser storage is disabled. */ }
  }, [textSize]);
  return [textSize, setTextSize] as const;
}
