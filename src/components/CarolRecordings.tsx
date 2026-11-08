import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useViewMode } from "./DataContext";
import { Card } from "./Ui";
import { getCarolRecordings, getRecordingUrl, type CarolRecording } from "../lib/carolRecordings";

function Player({ recording }: { recording: CarolRecording }) {
  const [url, setUrl] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (url && audio.current) void audio.current.play().catch(() => setError(true));
  }, [url]);
  async function start() {
    setLoading(true);
    setError(false);
    try { setUrl(await getRecordingUrl(recording.path)); }
    catch { setError(true); }
    finally { setLoading(false); }
  }
  return <div className="carol-recording">
    <span>{recording.title}</span>
    {url ? <audio ref={audio} controls preload="none" src={url} onError={() => setError(true)} aria-label={`Nahrávka: ${recording.title}`} /> :
      <button type="button" className="button button--secondary button--small" disabled={loading} onClick={() => void start()}>{loading ? "Načítám…" : "Přehrát"}</button>}
    {error && <p role="alert">Nahrávku se nepodařilo přehrát. <button type="button" onClick={() => { setUrl(undefined); setError(false); }}>Zkusit znovu</button></p>}
  </div>;
}

export function CarolRecordings({ songId }: { songId?: string }) {
  const { scope, memberPreview } = useViewMode();
  const query = useQuery({ queryKey: ["carol-recordings", scope, memberPreview], queryFn: getCarolRecordings });
  if (query.isPending) return null;
  if (query.error) return <p className="form-error" role="alert">Nahrávky se nepodařilo načíst.</p>;
  const tracks = songId ? query.data.filter((track) => track.songId === songId) : query.data;
  if (!tracks.length) return null;
  return <Card className="carol-recordings"><h2>{songId ? "Nahrávka" : "Hdy je zima mráz – nahrávky"}</h2>{tracks.map((track) => <Player key={track.trackNo} recording={track} />)}</Card>;
}
