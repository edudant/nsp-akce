import type { AppDatabase, EnsembleEvent } from "./domain";
import type { PairingTuning, generateSeasonPairs } from "./seasonPairing";
type Result = ReturnType<typeof generateSeasonPairs>;

/** Keep optimization off the UI thread, with a bound even if the solver stalls. */
export function generatePairsAsync(
  db: AppDatabase,
  event: EnsembleEvent,
  tuning: PairingTuning,
  seed: string,
): Promise<Result> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./pairingWorker.ts", import.meta.url), {
      type: "module",
    });
    const finish = () => {
      clearTimeout(timeout);
      worker.terminate();
    };
    const timeout = setTimeout(() => {
      finish();
      reject(
        new Error(
          "Výpočet trval příliš dlouho. Zkuste menší výběr nebo jinou variantu.",
        ),
      );
    }, 20_000);
    worker.onmessage = ({
      data,
    }: MessageEvent<{ result?: Result; error?: string }>) => {
      finish();
      if (data.result) resolve(data.result);
      else reject(new Error(data.error ?? "Generování se nezdařilo."));
    };
    worker.onerror = () => {
      finish();
      reject(
        new Error(
          "Generátor se nepodařilo spustit. Obnovte stránku a zkuste to znovu.",
        ),
      );
    };
    worker.postMessage({ db, event, tuning, seed });
  });
}
