import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { appApi } from "../lib/dataApi";

export const databaseQueryKey = ["database"] as const;

export const ViewContext = createContext({
  memberPreview: false,
  scope: "default",
});
export function useViewMode() {
  return useContext(ViewContext);
}

export function useDatabase() {
  const { memberPreview, scope } = useViewMode();
  return useQuery({
    queryKey: [...databaseQueryKey, scope, memberPreview],
    queryFn: () => appApi.getDatabase(memberPreview),
    staleTime: 20_000,
  });
}
