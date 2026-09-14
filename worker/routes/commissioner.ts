import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import { ApiError, badRequest, notFound } from "../errors.ts";
import { nameKey, validateName } from "../../shared/names.ts";
import { validatePicks } from "../../shared/picks.ts";
import type {
  CommissionerOverview,
  CommissionerPlayersResponse,
  CommissionerResetAccessResponse,
  CommissionerWeekResponse,
} from "../../shared/api.ts";
import { generateCode } from "../../shared/codes.ts";
import {
  commissionerWrittenPickKeys,
  deletePlayer,
  deviceCounts,
  findPlayerByKey,
  getPlayer,
  grantCommissioner,
  listAllPicks,
  listCommissioners,
  listGames,
  listPicks,
  listPlayers,
  listWeekGames,
  listWeekPicks,
  ownerOfEntry,
  pickHistory,
  playerStats,
  publicPlayer,
  renamePlayer,
  renamePool,
  replacePicks,
  revokeCommissioner,
  revokeDevices,
  setClaimCode,
  setPlayerReady,
} from "../db.ts";
import { SEASON } from "../ready.ts";
import { currentPool, requireCommissioner } from "../roles.ts";
import { parseWeek, toGameDTO } from "./public.ts";

/**
 * The commissioner's office: this pool's roster, its name, its invite, its stragglers. What is
 * *not* here is who won on Sunday — every pool scores the same games, so that authority lives in
 * the league office (`league.ts`) instead of being re-entered by each commissioner.
 */
export const commissionerRoutes = new Hono<AppEnv>();

commissionerRoutes.use("*", requireCommissioner);

commissionerRoutes.get("/", async (c) => {
  const pool = await currentPool(c);
  const [players, devices, commissioners] = await Promise.all([
    listPlayers(c.env.DB),
    deviceCounts(c.env.DB),
    listCommissioners(c.env.DB, pool.id),
  ]);
  const body: CommissionerOverview = {
    now: c.get("now"),
    pool: { id: pool.id, slug: pool.slug, name: pool.name, type: pool.type, season: pool.season, createdAt: pool.createdAt },
    playerCount: players.length,
    readyCount: players.filter((p) => p.ready).length,
    unclaimedCount: players.filter((p) => (devices.get(p.id) ?? 0) === 0).length,
    commissioners,
    roles: c.get("roles") ?? { commissioner: true, platformAdmin: false },
  };
  return c.json(body);
});

/** The one pool setting there is so far. The name on the board, the share card and the home screen. */
commissionerRoutes.patch("/pool", async (c) => {
  const pool = await currentPool(c);
  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 40) throw badRequest("INVALID_NAME", "A pool name is 2 to 40 characters.");
  await renamePool(c.env.DB, pool.id, name);
  c.set("pool", { ...pool, name });
  return c.json({ pool: { ...pool, name } });
});

commissionerRoutes.get("/players", async (c) => {
  const [players, stats, devices] = await Promise.all([
    listPlayers(c.env.DB),
    playerStats(c.env.DB),
    deviceCounts(c.env.DB),
  ]);
  const body: CommissionerPlayersResponse = {
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      lastSeenAt: p.lastSeenAt,
      picksCount: stats.get(p.id)?.picksCount ?? 0,
      weeksPlayed: stats.get(p.id)?.weeksPlayed ?? 0,
      devices: devices.get(p.id) ?? 0,
      code: p.claimCode,
      ready: p.ready,
    })),
  };
  return c.json(body);
});

/** The commissioner's checkmark against a name. Nothing a player can see. */
commissionerRoutes.put("/players/:id/ready", async (c) => {
  const player = await getPlayer(c.env.DB, c.req.param("id"));
  if (!player) throw notFound("NO_PLAYER", "No such player");
  const body = (await c.req.json().catch(() => ({}))) as { ready?: unknown };
  if (typeof body.ready !== "boolean") throw badRequest("VALIDATION", "ready must be true or false");
  await setPlayerReady(c.env.DB, player.id, body.ready, c.get("now"));
  return c.json({ player: publicPlayer(player), ready: body.ready });
});

commissionerRoutes.patch("/players/:id", async (c) => {
  const player = await getPlayer(c.env.DB, c.req.param("id"));
  if (!player) throw notFound("NO_PLAYER", "No such player");
  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
  const check = validateName(body.name);
  if (!check.ok) throw badRequest("INVALID_NAME", check.message);
  const key = nameKey(check.name);
  const clash = await findPlayerByKey(c.env.DB, key);
  if (clash && clash.id !== player.id) throw new ApiError(409, "NAME_TAKEN", "Another player already has that name");
  await renamePlayer(c.env.DB, player.id, check.name, key);
  return c.json({ player: { id: player.id, name: check.name } });
});

commissionerRoutes.delete("/players/:id", async (c) => {
  const player = await getPlayer(c.env.DB, c.req.param("id"));
  if (!player) throw notFound("NO_PLAYER", "No such player");
  await deletePlayer(c.env.DB, player.id);
  return c.json({ ok: true });
});

/**
 * Locked out, lost the phone, or someone else claimed the name first: a new code, and every device
 * signed out. The name stays spoken for — a reset leaves it at zero devices, and zero devices is
 * otherwise how an untouched roster name lets its owner in without a code.
 */
commissionerRoutes.post("/players/:id/reset-access", async (c) => {
  const player = await getPlayer(c.env.DB, c.req.param("id"));
  if (!player) throw notFound("NO_PLAYER", "No such player");
  const owner = await ownerOfEntry(c.env.DB, player.id);
  if (owner) {
    throw new ApiError(409, "MANAGED_ENTRY", `${player.name} is managed through ${owner.name}'s account, so there is no separate recovery code.`);
  }
  const body = (await c.req.json().catch(() => ({}))) as { revokeDevices?: unknown };
  const code = generateCode();
  await setClaimCode(c.env.DB, player.id, code, true);
  if (body.revokeDevices !== false) await revokeDevices(c.env.DB, player.id);
  const res: CommissionerResetAccessResponse = { player: { id: player.id, name: player.name }, code };
  return c.json(res);
});

/** The week as the commissioner sees it: every pick against every game, locked or not. */
commissionerRoutes.get("/weeks/:week", async (c) => {
  const week = parseWeek(c.req.param("week"));
  const now = c.get("now");
  const [games, picks, players] = await Promise.all([
    listWeekGames(c.env.DB, SEASON, week),
    listWeekPicks(c.env.DB, week),
    listPlayers(c.env.DB),
  ]);
  const names = new Map(players.map((p) => [p.id, p.name]));
  const body: CommissionerWeekResponse = {
    now,
    week,
    games: games.map((g) => ({
      ...toGameDTO(g, now),
      picks: picks
        .filter((p) => p.gameId === g.id)
        .map((p) => ({ playerId: p.playerId, name: names.get(p.playerId) ?? "?", team: p.team, rank: p.rank })),
    })),
    players: players.map(publicPlayer),
  };
  return c.json(body);
});

/**
 * Entering someone's picks for them — the text-me-my-picks case. It writes as the commissioner
 * rather than as the player, which is why the export can say who typed each row.
 */
commissionerRoutes.put("/players/:id/weeks/:week/picks", async (c) => {
  const player = await getPlayer(c.env.DB, c.req.param("id"));
  if (!player) throw notFound("NO_PLAYER", "No such player");
  const week = parseWeek(c.req.param("week"));
  const now = c.get("now");
  const body = (await c.req.json().catch(() => ({}))) as { picks?: unknown };
  const [games, existing] = await Promise.all([listWeekGames(c.env.DB, SEASON, week), listPicks(c.env.DB, player.id, week)]);
  const result = validatePicks({ submitted: body.picks, games, existing, now, ignoreLocks: true });
  if (!result.ok) throw new ApiError(result.error.status, result.error.code, result.error.message, result.error.details);
  await replacePicks(c.env.DB, player.id, week, result.final, now, true, null, player.name, "commissioner");
  return c.json({ now, picks: result.final });
});

/**
 * What a player saved, and when — including picks whose player row no longer exists. This is the
 * page to open when someone says their picks are gone.
 */
commissionerRoutes.get("/pick-history", async (c) => {
  const name = c.req.query("name");
  const weekRaw = c.req.query("week");
  const rows = await pickHistory(c.env.DB, {
    ...(name ? { playerName: name } : {}),
    ...(weekRaw ? { week: parseWeek(weekRaw) } : {}),
  });
  return c.json({ saves: rows });
});

/** Handing the office over, or sharing it. Only someone who already holds it can give it away. */
commissionerRoutes.post("/commissioners", async (c) => {
  const pool = await currentPool(c);
  const body = (await c.req.json().catch(() => ({}))) as { playerId?: unknown };
  if (typeof body.playerId !== "string") throw badRequest("VALIDATION", "playerId is required");
  const player = await getPlayer(c.env.DB, body.playerId);
  if (!player) throw notFound("NO_PLAYER", "No such player");
  if (await ownerOfEntry(c.env.DB, player.id)) {
    throw badRequest("MANAGED_ENTRY", `${player.name} is a managed entry. Make the account that owns it a commissioner instead.`);
  }
  await grantCommissioner(c.env.DB, pool.id, player.id, c.get("now"), c.get("account")?.id ?? null);
  return c.json({ commissioners: await listCommissioners(c.env.DB, pool.id) });
});

commissionerRoutes.delete("/commissioners/:playerId", async (c) => {
  const pool = await currentPool(c);
  const current = await listCommissioners(c.env.DB, pool.id);
  if (current.length <= 1) throw new ApiError(409, "LAST_COMMISSIONER", "A pool needs at least one commissioner.");
  await revokeCommissioner(c.env.DB, pool.id, c.req.param("playerId"));
  return c.json({ commissioners: await listCommissioners(c.env.DB, pool.id) });
});

/** Every pick with its game and result — the commissioner's backup and the tiebreak referee. */
commissionerRoutes.get("/export.csv", async (c) => {
  const pool = await currentPool(c);
  const [games, players, picks, viaCommissioner] = await Promise.all([
    listGames(c.env.DB, SEASON),
    listPlayers(c.env.DB),
    listAllPicks(c.env.DB),
    commissionerWrittenPickKeys(c.env.DB),
  ]);
  const gamesById = new Map(games.map((g) => [g.id, g]));
  const names = new Map(players.map((p) => [p.id, p.name]));
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = ["week,game_id,kickoff_utc,away,home,winner,player,pick,rank,points,entered_by"];
  for (const p of picks) {
    const g = gamesById.get(p.gameId);
    if (!g) continue;
    const points = g.winner && g.winner === p.team ? 6 - p.rank : 0;
    const enteredBy = viaCommissioner.has(`${p.playerId}:${p.gameId}`) ? "commissioner" : "player";
    lines.push(
      [g.week, g.id, g.kickoffAt, g.away, g.home, g.winner ?? "", names.get(p.playerId) ?? p.playerId, p.team, p.rank, g.winner ? points : "", enteredBy]
        .map(esc)
        .join(","),
    );
  }
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${pool.slug}-picks-${SEASON}.csv"`,
    },
  });
});
