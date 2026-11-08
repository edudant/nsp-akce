import { requireSupabase } from "./supabase";

export type CarolRecording = {
  trackNo: number;
  title: string;
  path: string;
  songId: string | null;
};

export async function getCarolRecordings(): Promise<CarolRecording[]> {
  const { data, error } = await requireSupabase().rpc("get_carol_recordings");
  if (error) throw error;
  return data as CarolRecording[];
}

export async function getRecordingUrl(path: string): Promise<string> {
  const { data, error } = await requireSupabase().storage
    .from("carol-recordings")
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
