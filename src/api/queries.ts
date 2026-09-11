import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminPlayersResponse,
  AdminSetResultRequest,
  AdminWeekResponse,
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

export function useSeasonBoard() {
  const { player } = usePlayer();
  return useQuery({
    queryKey: ["board", "season", player?.id ?? null],
    queryFn: () => api<SeasonBoardResponse>("/board/season"),
    refetchInterval: 60_000,
  });
}

export function useCreatePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api<CreatePlayerResponse>("/players", { body: { name } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["bootstrap"] }),
  });
}

// ---- admin ----

export function useAdminWeek(week: number, pin: string | null) {
  return useQuery({
    queryKey: ["admin", "week", week, pin],
    queryFn: () => api<AdminWeekResponse>(`/admin/weeks/${week}`, { pin: pin! }),
    enabled: !!pin,
  });
}

export function useAdminSetResult(pin: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ gameId, ...body }: AdminSetResultRequest & { gameId: string }) =>
      api<GameDTO>(`/admin/games/${gameId}/result`, { method: "PUT", body, pin: pin! }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "week"] });
      void qc.invalidateQueries({ queryKey: ["board"] });
      void qc.invalidateQueries({ queryKey: ["week"] });
      void qc.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });
}

export function useAdminPlayers(pin: string | null) {
  return useQuery({
    queryKey: ["admin", "players", pin],
    queryFn: () => api<AdminPlayersResponse>("/admin/players", { pin: pin! }),
    enabled: !!pin,
  });
}

export function useAdminPlayerMutation(pin: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; action: "rename"; name: string } | { id: string; action: "delete" }) =>
      input.action === "rename"
        ? api(`/admin/players/${input.id}`, { method: "PATCH", body: { name: input.name }, pin: pin! })
        : api(`/admin/players/${input.id}`, { method: "DELETE", pin: pin! }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      void qc.invalidateQueries({ queryKey: ["bootstrap"] });
      void qc.invalidateQueries({ queryKey: ["board"] });
    },
  });
}

export interface AdminStatus {
  now: string;
  build: string;
  scheduleVersion: string;
  scheduleSyncedAt: string | null;
  scheduleLastChanges: number | null;
  scheduleSyncError: string | null;
}

export function useAdminStatus(pin: string | null) {
  return useQuery({
    queryKey: ["admin", "status", pin],
    queryFn: () => api<AdminStatus>("/admin/status", { pin: pin! }),
    enabled: !!pin,
  });
}

export interface RemoteSyncResult {
  ok: boolean;
  reason?: string;
  fetched: number;
  updated: number;
  syncedAt: string;
}

export function useAdminSync(pin: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (source: "remote" | "bundled") =>
      api<RemoteSyncResult | { upserted: number; version: string }>("/admin/sync-schedule", { method: "POST", body: { source }, pin: pin! }),
    onSuccess: () => void qc.invalidateQueries(),
  });
}
