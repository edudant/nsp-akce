import { useQuery } from "@tanstack/react-query";
import { appApi } from "../lib/dataApi";

export const databaseQueryKey = ["database"] as const;

export function useDatabase() {
  return useQuery({
    queryKey: databaseQueryKey,
    queryFn: appApi.getDatabase,
    staleTime: 20_000,
  });
}
