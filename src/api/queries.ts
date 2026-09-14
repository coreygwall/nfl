import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ClaimResponse,
  ClaimRolesResponse,
  CommissionerOverview,
  CommissionerPlayersResponse,
  CommissionerResetAccessResponse,
  CommissionerWeekResponse,
  LeagueWeekResponse,
  PullResultsResponse,
  SetResultRequest,
  BootstrapResponse,
  CreatePlayerResponse,
  GameDTO,
  PutPicksRequest,
  PutPicksResponse,
  SeasonBoardResponse,
  WeekBoardResponse,
  WeekResponse,
} from "../../shared/api.ts";
import { api } from "./client.ts";
import { usePlayer } from "../lib/player.tsx";

export function useBootstrap() {
  const { player } = usePlayer();
  return useQuery({
    queryKey: ["bootstrap", player?.id ?? null],
    queryFn: () => api<BootstrapResponse>("/bootstrap"),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function useWeek(week: number | null) {
  const { player } = usePlayer();
  return useQuery({
    queryKey: ["week", week, player?.id ?? null],
    queryFn: () => api<WeekResponse>(`/weeks/${week}`),
    enabled: week !== null,
    refetchInterval: 60_000,
  });
}

export function usePutPicks(week: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PutPicksRequest) => api<PutPicksResponse>(`/weeks/${week}/picks`, { method: "PUT", body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["week", week] });
      void qc.invalidateQueries({ queryKey: ["board"] });
      void qc.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });
}

export function useWeekBoard(week: number | null) {
  const { player } = usePlayer();
  return useQuery({
    queryKey: ["board", "week", week, player?.id ?? null],
    queryFn: () => api<WeekBoardResponse>(`/board/week/${week}`),
    enabled: week !== null,
    refetchInterval: 60_000,
  });
}

/**
 * The season board is the most expensive read in the app — it scores every pick of every week for
 * everyone — and it is also the slowest-moving thing on screen: a standing only changes when a
 * game finishes. A minute was the week board's cadence borrowed without thinking. Five is plenty,
 * and results still land within a minute on the week board where people are actually watching.
 */
export function useSeasonBoard(enabled = true) {
  const { player } = usePlayer();
  return useQuery({
    queryKey: ["board", "season", player?.id ?? null],
    queryFn: () => api<SeasonBoardResponse>("/board/season"),
    enabled,
    refetchInterval: 5 * 60_000,
  });
}

export function useCreatePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api<CreatePlayerResponse>("/players", { body: { name } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["bootstrap"] }),
  });
}

/** Claims a name for this device. Omit the code for a name nobody holds yet. */
export function useClaimPlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, code }: { id: string; code?: string }) =>
      api<ClaimResponse>(`/players/${id}/claim`, { body: code ? { code } : {} }),
    onSuccess: () => void qc.invalidateQueries(),
  });
}

// ---- commissioner ----
//
// None of these take a PIN any more. The office is attached to the signed-in account, so the
// session that carries your picks is the session that carries your keys.

export function useRoles() {
  const boot = useBootstrap();
  return boot.data?.roles ?? { commissioner: false, platformAdmin: false };
}

export function useCommissionerOverview(enabled: boolean) {
  return useQuery({
    queryKey: ["commissioner", "overview"],
    queryFn: () => api<CommissionerOverview>("/commissioner"),
    enabled,
  });
}

export function useRenamePool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api("/commissioner/pool", { method: "PATCH", body: { name } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["commissioner"] });
      void qc.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });
}

export function useCommissionerWeek(week: number, enabled: boolean) {
  return useQuery({
    queryKey: ["commissioner", "week", week],
    queryFn: () => api<CommissionerWeekResponse>(`/commissioner/weeks/${week}`),
    enabled,
  });
}

export function useCommissionerPlayers(enabled: boolean) {
  return useQuery({
    queryKey: ["commissioner", "players"],
    queryFn: () => api<CommissionerPlayersResponse>("/commissioner/players"),
    enabled,
  });
}

export function useCommissionerPlayerMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; action: "rename"; name: string } | { id: string; action: "delete" }) =>
      input.action === "rename"
        ? api(`/commissioner/players/${input.id}`, { method: "PATCH", body: { name: input.name } })
        : api(`/commissioner/players/${input.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["commissioner"] });
      void qc.invalidateQueries({ queryKey: ["bootstrap"] });
      void qc.invalidateQueries({ queryKey: ["board"] });
    },
  });
}

export function useResetAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<CommissionerResetAccessResponse>(`/commissioner/players/${id}/reset-access`, { method: "POST", body: {} }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["commissioner"] }),
  });
}

export function useSetReady() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ready }: { id: string; ready: boolean }) =>
      api<{ ready: boolean }>(`/commissioner/players/${id}/ready`, { method: "PUT", body: { ready } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["commissioner"] }),
  });
}

// ---- league office ----
//
// Results, the schedule and the feed. One authority for every pool, which is why none of it is
// reachable from a commissioner's console.

export function useLeagueWeek(week: number, enabled: boolean) {
  return useQuery({
    queryKey: ["league", "week", week],
    queryFn: () => api<LeagueWeekResponse>(`/league/weeks/${week}`),
    enabled,
  });
}

export function useSetResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ gameId, ...body }: SetResultRequest & { gameId: string }) =>
      api<GameDTO>(`/league/games/${gameId}/result`, { method: "PUT", body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["league"] });
      void qc.invalidateQueries({ queryKey: ["commissioner"] });
      void qc.invalidateQueries({ queryKey: ["board"] });
      void qc.invalidateQueries({ queryKey: ["week"] });
      void qc.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });
}

export interface LeagueStatus {
  now: string;
  build: string;
  season: number;
  scheduleVersion: string;
  scheduleSyncedAt: string | null;
  scheduleLastChanges: number | null;
  scheduleSyncError: string | null;
  resultsSyncedAt: string | null;
  resultsSyncError: string | null;
  admins: { id: string; name: string; grantedAt: string }[];
}

export function useLeagueStatus(enabled: boolean) {
  return useQuery({
    queryKey: ["league", "status"],
    queryFn: () => api<LeagueStatus>("/league/status"),
    enabled,
  });
}

export interface RemoteSyncResult {
  ok: boolean;
  reason?: string;
  fetched: number;
  updated: number;
  syncedAt: string;
}

export function useSyncSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (source: "remote" | "bundled") =>
      api<RemoteSyncResult | { upserted: number; version: string }>("/league/sync-schedule", { method: "POST", body: { source } }),
    onSuccess: () => void qc.invalidateQueries(),
  });
}

export function usePullResults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (week?: number) => api<PullResultsResponse>("/league/pull-results", { method: "POST", body: week ? { week } : {} }),
    onSuccess: () => void qc.invalidateQueries(),
  });
}

/** The one call the PIN still makes: attach both offices to this account, once. */
export function useClaimRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pin: string) => api<ClaimRolesResponse>("/roles/claim", { method: "POST", body: {}, pin }),
    onSuccess: () => void qc.invalidateQueries(),
  });
}
