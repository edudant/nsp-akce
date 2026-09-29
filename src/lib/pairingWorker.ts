import { generateSeasonPairs } from "./seasonPairing";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({
      result: generateSeasonPairs(data.db, data.event, data.tuning, data.seed),
    });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : "Generování se nezdařilo.",
    });
  }
};
