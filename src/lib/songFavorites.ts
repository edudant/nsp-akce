import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useViewMode } from "../components/DataContext";
import { requireSupabase } from "./supabase";

export async function getSongFavorites(): Promise<string[]> {
  const { data, error } = await requireSupabase().rpc("get_song_favorites_v8");
  if (error) throw error;
  return data ?? [];
}

export async function setSongFavorite(songId: string, favorite: boolean) {
  const { error } = await requireSupabase().rpc("set_song_favorite_v8", {
    target_song_id: songId,
    favorite,
  });
  if (error) throw error;
}

export function useSongFavorites(enabled = true) {
  const { scope } = useViewMode();
  const client = useQueryClient();
  const key = ["song-favorites", scope];
  const query = useQuery({ queryKey: key, queryFn: getSongFavorites, enabled });
  const mutation = useMutation({
    mutationFn: ({ songId, favorite }: { songId: string; favorite: boolean }) =>
      setSongFavorite(songId, favorite),
    onSuccess: async (_, { songId, favorite }) => {
      client.setQueryData<string[]>(key, (old = []) =>
        favorite
          ? [...new Set([...old, songId])]
          : old.filter((id) => id !== songId),
      );
      await client.invalidateQueries({ queryKey: key });
    },
  });
  return {
    ids: query.data ?? [],
    ready: query.isSuccess,
    pendingId: mutation.isPending ? mutation.variables.songId : undefined,
    error: query.error ?? mutation.error,
    toggle: (songId: string) =>
      mutation.mutate({ songId, favorite: !query.data?.includes(songId) }),
  };
}
