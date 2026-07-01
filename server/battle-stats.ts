import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import * as readline from "readline";

import { FS } from "../lib";
import { toID } from "../sim/dex-data";

const runtimeGlobals = globalThis as AnyObject;
const STATS_PATH = runtimeGlobals.Monitor?.logPath
	? runtimeGlobals.Monitor.logPath("battlestats/battles.jsonl").path
	: FS("logs/battlestats/battles.jsonl").path;
const STATS_CACHE_TTL = 5 * 60 * 1000;
const STATS_DIR = path.dirname(STATS_PATH);
/** Rotate the active JSONL file when it exceeds 100 MB. */
const STATS_ROTATE_SIZE = 100 * 1024 * 1024;

/**
 * Returns all battle-stats JSONL files in the stats directory, sorted
 * so rotated archives (battles.1.jsonl, battles.2.jsonl, …) are read
 * before the active file (battles.jsonl).  This ensures the stats page
 * always reflects every record even after external log rotation.
 */
async function getStatsFiles(): Promise<string[]> {
	try {
		const entries = await FS(STATS_DIR).readdirIfExists();
		return entries
			.filter(f => f.startsWith('battles') && f.endsWith('.jsonl'))
			.sort()
			.map(f => path.join(STATS_DIR, f));
	} catch {
		return [];
	}
}

export const RELUMI_TRACKED_FORMATS = [
	"gen8relumisinglesrandom",
	"gen8relumidoublesrandom",
	"gen8relumisinglesanythinggoes",
	"gen8relumisinglesubers",
	"gen8relumisinglesou",
	"gen8relumidoublesanythinggoes",
	"gen8relumidoublesubers",
	"gen8relumidoublesou",
] as const;

export type RelumiTrackedFormat = (typeof RELUMI_TRACKED_FORMATS)[number];

export type StatsCategoryId = RelumiTrackedFormat;

export interface BattleStatsPokemon {
	species: string;
	ability: string;
	item: string;
	moves: string[];
	nature: string;
	ivs: SparseStatsTable;
	evs: SparseStatsTable;
}

export interface BattleStatsRecord {
	battleId: string;
	format: RelumiTrackedFormat;
	timestamp: number;
	playerA: string;
	playerB: string;
	winner: string | null;
	/**
	 * How the battle ended. Mirrors `RoomBattle.endType` and is the source
	 * of truth for forfeit/disconnect counts. The surviving player is still
	 * recorded as `winner`, so `!winner` is not a reliable forfeit signal.
	 * Records persisted before this field existed will fall back to 'unknown'.
	 */
	endType: 'normal' | 'forced' | 'forfeit' | 'tie' | 'unknown';
	turns: number;
	teamA: BattleStatsPokemon[];
	teamB: BattleStatsPokemon[];
}

interface CacheEntry<T = BattleStatsApiResponse> {
	expiresAt: number;
	payload: T;
	json: string;
}

interface PokemonCount {
	name: string;
	count: number;
	pct: number;
	wins: number;
	winRate: number;
}

interface CategoryOutput {
	id: StatsCategoryId;
	label: string;
	displayFormat: string;
	battleStats: {
		totalBattlesAllTime: number;
		battlesLast24h: number;
		battlesLast7d: number;
		battlesLast30d: number;
		averageBattlesPerDay30d: number;
		peakHourOfDay: number | null;
		averageBattleDurationTurns: number;
		forfeitDisconnectRate: number;
	};
	userLeaderboard: {
		rows: Array<{
			user: string;
			battles: number;
			wins: number;
			winRate: number;
			currentStreak: number;
		}>;
		topByBattles: Array<{
			user: string;
			battles: number;
			wins: number;
			winRate: number;
		}>;
		topByWinRate: Array<{
			user: string;
			battles: number;
			wins: number;
			winRate: number;
		}>;
		topByCurrentWinStreak: Array<{
			user: string;
			currentWinStreak: number;
			battles: number;
		}>;
	};
	pokemonUsage: {
		totalTeamSlots: number;
		pokemon: Array<{
			species: string;
			appearances: number;
			usagePct: number;
			winRate: number;
			abilities: PokemonCount[];
			items: PokemonCount[];
			moves: PokemonCount[];
			versatilityCount: number;
			dominantScore: number;
			counters: Array<{
				species: string;
				lossRate: number;
				encounters: number;
			}>;
		}>;
		highestWinRatePokemon: { species: string; winRate: number } | null;
		lowestWinRatePokemon: { species: string; winRate: number } | null;
		mostVersatilePokemon: { species: string; combinations: number } | null;
		mostDominantPokemon: { species: string; dominantScore: number } | null;
	};
	metaTrends: {
		mostCommonCore: {
			pokemonA: string;
			pokemonB: string;
			count: number;
		} | null;
		topCommonCores: Array<{
			pokemonA: string;
			pokemonB: string;
			count: number;
		}>;
		mostCommonTeamArchetype: null;
		formatHealthIndicator: number;
	};
	topTeams: Array<{
		signature: string;
		appearances: number;
		wins: number;
		winRate: number;
		team: BattleStatsPokemon[];
	}>;
}

export interface BattleStatsApiResponse {
	generatedAt: number;
	cacheTtlMs: number;
	request: { format: string; range: string; user?: string };
	categories: CategoryOutput[];
}

const CATEGORY_CONFIG: Record<
	StatsCategoryId,
	{ label: string; displayFormat: string; formats: RelumiTrackedFormat[] }
> = {
	gen8relumisinglesrandom: {
		label: "Random Singles",
		displayFormat: "[Gen 8] Relumi Random Singles",
		formats: ["gen8relumisinglesrandom"],
	},
	gen8relumidoublesrandom: {
		label: "Random Doubles",
		displayFormat: "[Gen 8] Relumi Random Doubles",
		formats: ["gen8relumidoublesrandom"],
	},
	gen8relumisinglesanythinggoes: {
		label: "Singles Anything Goes",
		displayFormat: "[Gen 8] Relumi Singles Anything Goes",
		formats: ["gen8relumisinglesanythinggoes"],
	},
	gen8relumisinglesubers: {
		label: "Singles Ubers",
		displayFormat: "[Gen 8] Relumi Singles Ubers",
		formats: ["gen8relumisinglesubers"],
	},
	gen8relumisinglesou: {
		label: "Singles OU",
		displayFormat: "[Gen 8] Relumi Singles OU",
		formats: ["gen8relumisinglesou"],
	},
	gen8relumidoublesanythinggoes: {
		label: "Doubles Anything Goes",
		displayFormat: "[Gen 8] Relumi Doubles Anything Goes",
		formats: ["gen8relumidoublesanythinggoes"],
	},
	gen8relumidoublesubers: {
		label: "Doubles Ubers",
		displayFormat: "[Gen 8] Relumi Doubles Ubers",
		formats: ["gen8relumidoublesubers"],
	},
	gen8relumidoublesou: {
		label: "Doubles OU",
		displayFormat: "[Gen 8] Relumi Doubles OU",
		formats: ["gen8relumidoublesou"],
	},
};

const CATEGORY_IDS: StatsCategoryId[] = [...RELUMI_TRACKED_FORMATS];

const FORMAT_TO_CATEGORY: Record<RelumiTrackedFormat, StatsCategoryId> = {
	gen8relumisinglesrandom: "gen8relumisinglesrandom",
	gen8relumidoublesrandom: "gen8relumidoublesrandom",
	gen8relumisinglesanythinggoes: "gen8relumisinglesanythinggoes",
	gen8relumisinglesubers: "gen8relumisinglesubers",
	gen8relumisinglesou: "gen8relumisinglesou",
	gen8relumidoublesanythinggoes: "gen8relumidoublesanythinggoes",
	gen8relumidoublesubers: "gen8relumidoublesubers",
	gen8relumidoublesou: "gen8relumidoublesou",
};

/**
 * Converts a format string into a tracked Relumi format ID if eligible.
 */
export function normalizeRelumiFormat(
	format: string,
): RelumiTrackedFormat | null {
	const id = toID(format);
	if (id.includes("testing")) return null;
	if ((RELUMI_TRACKED_FORMATS as readonly string[]).includes(id)) {
		return id as RelumiTrackedFormat;
	}
	return null;
}

/**
 * Returns whether a battle should be included in public Relumi battle stats.
 */
export function shouldLogBattleStats(battle: RoomBattle): boolean {
	if (!battle.rated) return false;
	if (battle.challengeType !== "rated") return false;
	if (battle.room.settings.isPrivate) return false;
	if (battle.room.hideReplay) return false;
	return true;
}

/**
 * Maps a tracked format ID to its API category key.
 */
export function getCategoryForFormat(
	format: RelumiTrackedFormat,
): StatsCategoryId {
	return FORMAT_TO_CATEGORY[format];
}

/**
 * Reduces a full team set to the fields required by battle statistics.
 */
export function toBattleStatsPokemon(set: PokemonSet): BattleStatsPokemon {
	return {
		species: set.species,
		ability: set.ability || "",
		item: set.item || "",
		moves: [...(set.moves || [])],
		nature: set.nature || "",
		ivs: { ...(set.ivs || {}) },
		evs: { ...(set.evs || {}) },
	};
}

function getRangeStart(range: string, now: number): number | null {
	if (range === "all") return null;
	if (range === "7d") return now - 7 * 24 * 60 * 60 * 1000;
	if (range === "30d") return now - 30 * 24 * 60 * 60 * 1000;
	return null;
}

/**
 * Zero-allocation UTC date key (YYYY-MM-DD) from a Unix-epoch
 * millisecond timestamp.  Avoids constructing a Date object in hot
 * aggregation loops.  Based on Howard Hinnant's civil_from_days algorithm.
 */
function formatUTCDateKey(ts: number): string {
	const z = Math.floor(ts / 86400000) + 719468;
	const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
	const doe = z - era * 146097;
	const yoe = Math.floor(
		(doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) -
			Math.floor(doe / 146096)) / 365,
	);
	const y = yoe + era * 400;
	const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
	const mp = Math.floor((5 * doy + 2) / 153);
	const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
	const m = mp + (mp < 10 ? 3 : -9);
	const year = y + (m <= 2 ? 1 : 0);
	return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

interface RawCount {
	count: number;
	wins: number;
}

function topCounts(
	counts: Map<string, RawCount>,
	denominator: number,
	limit: number,
): PokemonCount[] {
	if (!denominator) return [];
	return [...counts.entries()]
		.sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
		.slice(0, limit)
		.map(([name, { count, wins }]) => ({
			name,
			count,
			pct: (count / denominator) * 100,
			wins,
			winRate: count ? (wins / count) * 100 : 0,
		}));
}

/**
 * Daily usage/win-rate trend for a single species. `dayKey` is an ISO date
 * (`YYYY-MM-DD`) string; `appearances` counts how often the species showed
 * up in any team of that day's records; `slots` is the total team-slot
 * denominator for the day so usage% and win-rate are comparable across days.
 */
interface SpeciesTrendDay {
	dayKey: string;
	appearances: number;
	wins: number;
	slots: number;
}

/**
 * Per-day usage/win-rate series for a single species over the requested
 * range. Sorted chronologically (oldest first).
 */
export interface SpeciesTrendResult {
	species: string;
	days: Array<{ date: string; usagePct: number; winRate: number }>;
}

/**
 * Aggregates per-day usage and win-rate trends for a single species ID.
 * Returns an empty array when there is no data in the range.
 * When `userFilter` is provided, only the specified player's own team
 * slots and species appearances are counted, matching "My stats only".
 */
export async function aggregateSpeciesTrends(
	records: readonly BattleStatsRecord[],
	speciesId: string,
	rangeStart: number | null,
	userFilter?: string | null,
): Promise<SpeciesTrendResult> {
	const target = toID(speciesId);
	const filtered =
		rangeStart === null ? records : records.filter((r) => r.timestamp >= rangeStart);

	const dayMap = new Map<string, SpeciesTrendDay>();
	let yieldCounter = 0;
	for (const record of filtered) {
		// Bucket by calendar-day (UTC) to keep data comparable across time zones.
		const dayKey = formatUTCDateKey(record.timestamp);
		let bucket = dayMap.get(dayKey);
		if (!bucket) {
			bucket = { dayKey, appearances: 0, wins: 0, slots: 0 };
			dayMap.set(dayKey, bucket);
		}
		const teams = [
			{
				player: record.playerA,
				mons: record.teamA,
				won: !!record.winner && record.winner === record.playerA,
			},
			{
				player: record.playerB,
				mons: record.teamB,
				won: !!record.winner && record.winner === record.playerB,
			},
		];
		for (const side of teams) {
			if (userFilter && toID(side.player) !== userFilter) continue;
			bucket.slots += side.mons.length;
			for (const mon of side.mons) {
				if (toID(mon.species) !== target) continue;
				bucket.appearances++;
				if (side.won) bucket.wins++;
			}
		}
		if (++yieldCounter % 5000 === 0) {
			await new Promise<void>((r) => setImmediate(r));
		}
	}

	const days = [...dayMap.values()]
		.sort((a, b) => a.dayKey.localeCompare(b.dayKey))
		.map((b) => ({
			date: b.dayKey,
			usagePct: b.slots ? (b.appearances / b.slots) * 100 : 0,
			winRate: b.appearances ? (b.wins / b.appearances) * 100 : 0,
		}));

	return { species: target, days };
}

/**
 * Picks a uniformly-random team (teamA or teamB) from one random record
 * matching the format filter. Returns null when no records exist.
 */
function pickRandomTeam(
	records: readonly BattleStatsRecord[],
): BattleStatsPokemon[] | null {
	if (!records.length) return null;
	const idx = Math.floor(Math.random() * records.length);
	const record = records[idx];
	// 50/50 bias between which team's set we surface for export.
	const team = Math.random() < 0.5 ? record.teamA : record.teamB;
	return team.map((m) => ({ ...m, moves: [...m.moves], ivs: { ...m.ivs }, evs: { ...m.evs } }));
}

/**
 * Aggregates battle records into the API response payload.
 *
 * Yields to the event loop via setImmediate every N records in hot
 * loops so the website stays responsive during large aggregations.
 * Records should be pre-filtered by caller when a user filter is
 * active (see BattleStatsStore.getRecordsForUser).
 */
export async function aggregateBattleStats(
	records: readonly BattleStatsRecord[],
	query: { format: string; range: string; user?: string },
	now = Date.now(),
): Promise<BattleStatsApiResponse> {
	const normalizedFormat =
		query.format === "all" ? "all" : normalizeRelumiFormat(query.format);
	const userFilter = query.user ? toID(query.user) : null;
	const rangeStart = getRangeStart(query.range, now);
	const allForFormat =
		normalizedFormat === "all"
			? records
			: normalizedFormat
				? records.filter((r) => r.format === normalizedFormat)
				: [];
	const ranged =
		rangeStart === null
			? allForFormat
			: allForFormat.filter((r) => r.timestamp >= rangeStart);

	const categoriesToInclude =
		normalizedFormat === "all"
			? CATEGORY_IDS
			: normalizedFormat
				? [getCategoryForFormat(normalizedFormat)]
				: [];

	const categories: CategoryOutput[] = [];
	for (const categoryId of categoriesToInclude) {
		// Yield between categories so the "all" format doesn't
		// run 16 synchronous .filter() passes back-to-back.
		await new Promise<void>((r) => setImmediate(r));
		const config = CATEGORY_CONFIG[categoryId];
		const categoryAll = allForFormat.filter((r) =>
			config.formats.includes(r.format),
		);
		const categoryRanged = ranged.filter((r) =>
			config.formats.includes(r.format),
		);

		const cutoff24h = now - 24 * 60 * 60 * 1000;
		const cutoff7d = now - 7 * 24 * 60 * 60 * 1000;
		const cutoff30d = now - 30 * 24 * 60 * 60 * 1000;

		// Single-pass computation of time-window counts, turns, and
		// forfeit totals to avoid iterating categoryAll / categoryRanged
		// multiple times.
		let battlesLast24h = 0;
		let battlesLast7d = 0;
		let battlesLast30d = 0;
		let totalTurns = 0;
		let forfeits = 0;
		const hourBuckets = new Array<number>(24).fill(0);
		const userStats = new Map<
			string,
			{ battles: number; wins: number; currentStreak: number }
		>();

		let yieldCounter = 0;
		for (const r of categoryAll) {
			if (r.timestamp >= cutoff30d) battlesLast30d++;
			if (r.timestamp >= cutoff7d) battlesLast7d++;
			if (r.timestamp >= cutoff24h) battlesLast24h++;
			if (++yieldCounter % 50000 === 0)
				await new Promise<void>((r) => setImmediate(r));
		}

		yieldCounter = 0;
		for (const r of categoryRanged) {
			totalTurns += r.turns;
			if (r.endType === 'forfeit' || r.endType === 'forced') forfeits++;
			hourBuckets[Math.floor((r.timestamp / 3600000) % 24)]++;
			if (++yieldCounter % 50000 === 0)
				await new Promise<void>((r) => setImmediate(r));
		}

		const peakHour = categoryRanged.length
			? hourBuckets.reduce(
					(best, cur, idx) => (cur > hourBuckets[best] ? idx : best),
					0,
				)
			: null;

		let timelineYieldCounter = 0;
		for (const battle of categoryRanged) {
			for (const player of [battle.playerA, battle.playerB]) {
				if (userFilter && toID(player) !== userFilter) continue;
				if (!userStats.has(player))
					userStats.set(player, { battles: 0, wins: 0, currentStreak: 0 });
				const stat = userStats.get(player)!;
				stat.battles++;
				if (battle.winner && battle.winner === player) {
					stat.wins++;
					stat.currentStreak++;
				} else {
					stat.currentStreak = 0;
				}
			}
			if (++timelineYieldCounter % 5000 === 0)
				await new Promise<void>((r) => setImmediate(r));
		}

		const userRows = [...userStats.entries()].map(([user, stat]) => ({
			user,
			...stat,
			winRate: stat.battles ? (stat.wins / stat.battles) * 100 : 0,
		}));

		const topByBattles = [...userRows]
			.sort(
				(a, b) =>
					b.battles - a.battles ||
					b.wins - a.wins ||
					a.user.localeCompare(b.user),
			)
			.slice(0, 10);
		const topByWinRate = [...userRows]
			.filter((u) => u.battles >= 5)
			.sort(
				(a, b) =>
					b.winRate - a.winRate ||
					b.battles - a.battles ||
					a.user.localeCompare(b.user),
			)
			.slice(0, 10);
		const topByCurrentWinStreak = [...userRows]
			.sort(
				(a, b) =>
					b.currentStreak - a.currentStreak ||
					b.battles - a.battles ||
					a.user.localeCompare(b.user),
			)
			.slice(0, 10)
			.map((row) => ({
				user: row.user,
				currentWinStreak: row.currentStreak,
				battles: row.battles,
			}));

		const pokemonStats = new Map<
			string,
			{
				name: string;
				appearances: number;
				wins: number;
				abilityCounts: Map<string, RawCount>;
				itemCounts: Map<string, RawCount>;
				moveCounts: Map<string, RawCount>;
				combinations: Set<string>;
			}
		>();
		const pairCounts = new Map<string, number>();
		const teamSignatures = new Map<
			string,
			{
				appearances: number;
				wins: number;
				representative: BattleStatsPokemon[];
				lastTimestamp: number;
			}
		>();
		let totalTeamSlots = 0;
		yieldCounter = 0;
		for (const battle of categoryRanged) {
			const teams = [
				{
					player: battle.playerA,
					mons: battle.teamA,
					won: !!battle.winner && battle.winner === battle.playerA,
				},
				{
					player: battle.playerB,
					mons: battle.teamB,
					won: !!battle.winner && battle.winner === battle.playerB,
				},
			];
			for (const side of teams) {
				if (userFilter && toID(side.player) !== userFilter) continue;
				totalTeamSlots += side.mons.length;
				const uniqueSpecies = [
					...new Set(side.mons.map((mon) => toID(mon.species))),
				].sort();
				for (let i = 0; i < uniqueSpecies.length; i++) {
					for (let j = i + 1; j < uniqueSpecies.length; j++) {
						const key = `${uniqueSpecies[i]}|${uniqueSpecies[j]}`;
						pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
					}
				}
				// Aggregate teams by sorted-species signature so we can surface
				// the most common archetypes and their win rates.
				const sig = uniqueSpecies.join("/");
				let teamEntry = teamSignatures.get(sig);
				if (!teamEntry) {
					teamEntry = { appearances: 0, wins: 0, representative: side.mons, lastTimestamp: battle.timestamp };
					teamSignatures.set(sig, teamEntry);
				}
				teamEntry.appearances++;
				if (side.won) teamEntry.wins++;
				if (battle.timestamp >= teamEntry.lastTimestamp) {
					teamEntry.representative = side.mons;
					teamEntry.lastTimestamp = battle.timestamp;
				}
				for (const mon of side.mons) {
					const speciesId = toID(mon.species);
					if (!pokemonStats.has(speciesId)) {
						pokemonStats.set(speciesId, {
							name: mon.species,
							appearances: 0,
							wins: 0,
							abilityCounts: new Map(),
							itemCounts: new Map(),
							moveCounts: new Map(),
							combinations: new Set(),
						});
					}
					const entry = pokemonStats.get(speciesId)!;
					entry.appearances++;
					if (side.won) entry.wins++;
					const ability = mon.ability || "none";
					const item = mon.item || "none";
					const abilityCount = entry.abilityCounts.get(ability) || { count: 0, wins: 0 };
					abilityCount.count++;
					if (side.won) abilityCount.wins++;
					entry.abilityCounts.set(ability, abilityCount);
					const itemCount = entry.itemCounts.get(item) || { count: 0, wins: 0 };
					itemCount.count++;
					if (side.won) itemCount.wins++;
					entry.itemCounts.set(item, itemCount);
					const moveNames = [...(mon.moves || [])];
					for (const move of moveNames) {
						const moveCount = entry.moveCounts.get(move) || { count: 0, wins: 0 };
						moveCount.count++;
						if (side.won) moveCount.wins++;
						entry.moveCounts.set(move, moveCount);
					}
					const comboMoves = moveNames.map(toID).sort().join(",");
					entry.combinations.add(
						`${toID(ability)}|${toID(item)}|${comboMoves}`,
					);
				}
			}
			if (++yieldCounter % 5000 === 0)
				await new Promise<void>((r) => setImmediate(r));
		}

		// Build counter map: for each species, track opposing species
		// and how often the tracked species lost to them
		const counterMap = new Map<string, Map<string, { encounters: number; losses: number }>>();
		yieldCounter = 0;
		for (const battle of categoryRanged) {
			const teams = [
				{
					player: battle.playerA,
					mons: battle.teamA,
					won: !!battle.winner && battle.winner === battle.playerA,
				},
				{
					player: battle.playerB,
					mons: battle.teamB,
					won: !!battle.winner && battle.winner === battle.playerB,
				},
			];
			for (const side of teams) {
				if (userFilter && toID(side.player) !== userFilter) continue;
				const oppSide = teams.find((s) => s !== side)!;
				for (const mon of side.mons) {
					const speciesId = toID(mon.species);
					let counters = counterMap.get(speciesId);
					if (!counters) {
						counters = new Map();
						counterMap.set(speciesId, counters);
					}
					for (const oppMon of oppSide.mons) {
						const oppId = toID(oppMon.species);
						if (oppId === speciesId) continue;
						let stats = counters.get(oppId);
						if (!stats) {
							stats = { encounters: 0, losses: 0 };
							counters.set(oppId, stats);
						}
						stats.encounters++;
						if (!side.won) stats.losses++;
					}
				}
			}
			if (++yieldCounter % 5000 === 0)
				await new Promise<void>((r) => setImmediate(r));
		}

		// Build species ID → display name lookup for counter resolution
		const speciesIdToName = new Map<string, string>();
		for (const [speciesId, stat] of pokemonStats) {
			speciesIdToName.set(speciesId, stat.name);
		}

		// Compute top counters per species (min 3 encounters, sorted by loss rate)
		const getTopCounters = (speciesId: string): Array<{ species: string; lossRate: number; encounters: number }> => {
			const stats = counterMap.get(toID(speciesId));
			if (!stats) return [];
			return [...stats.entries()]
				.map(([oppId, s]) => ({
					species: speciesIdToName.get(oppId) || oppId,
					lossRate: s.encounters >= 3 ? (s.losses / s.encounters) * 100 : 0,
					encounters: s.encounters,
				}))
				.filter((c) => c.encounters >= 3)
				.sort((a, b) => b.lossRate - a.lossRate || b.encounters - a.encounters)
				.slice(0, 5);
		};

		const pokemonRows = [...pokemonStats.values()].map((stat) => {
			const usagePct = totalTeamSlots
				? (stat.appearances / totalTeamSlots) * 100
				: 0;
			const winRate = stat.appearances
				? (stat.wins / stat.appearances) * 100
				: 0;
			const dominantScore = (usagePct / 100) * (winRate / 100);
			return {
				species: stat.name,
				appearances: stat.appearances,
				usagePct,
				winRate,
				abilities: topCounts(stat.abilityCounts, stat.appearances, 3),
				items: topCounts(stat.itemCounts, stat.appearances, 3),
				moves: topCounts(stat.moveCounts, stat.appearances, 6),
				versatilityCount: stat.combinations.size,
				dominantScore,
				counters: getTopCounters(stat.name),
			};
		});
		pokemonRows.sort(
			(a, b) =>
				b.appearances - a.appearances || a.species.localeCompare(b.species),
		);

		const byWinRate = [...pokemonRows].sort(
			(a, b) => b.winRate - a.winRate || b.appearances - a.appearances,
		);
		const byWinRateAsc = [...pokemonRows].sort(
			(a, b) => a.winRate - b.winRate || b.appearances - a.appearances,
		);
		const byVersatility = [...pokemonRows].sort(
			(a, b) =>
				b.versatilityCount - a.versatilityCount ||
				b.appearances - a.appearances,
		);
		const byDominance = [...pokemonRows].sort(
			(a, b) =>
				b.dominantScore - a.dominantScore || b.appearances - a.appearances,
		);

		const sortedCores = [...pairCounts.entries()].sort((a, b) => b[1] - a[1]);
		const topCore = sortedCores[0] || null;
		const topCoreData = topCore
			? {
				pokemonA: topCore[0].split("|")[0],
				pokemonB: topCore[0].split("|")[1],
				count: topCore[1],
			}
			: null;
		const topCommonCores = sortedCores.slice(0, 10).map(([pair, count]) => {
			const [pokemonA, pokemonB] = pair.split("|");
			return { pokemonA, pokemonB, count };
		});

		const users = new Set<string>();
		let usersYieldCounter = 0;
		for (const battle of categoryRanged) {
			if (userFilter) {
				users.add(
					toID(battle.playerA) === userFilter
						? battle.playerA
						: battle.playerB,
				);
			} else {
				users.add(battle.playerA);
				users.add(battle.playerB);
			}
			if (++usersYieldCounter % 10000 === 0)
				await new Promise<void>((r) => setImmediate(r));
		}
		const formatHealth = categoryRanged.length
			? users.size / categoryRanged.length
			: 0;

		// Pick top 5 most-used team archetypes (sorted-species signature) with
		// a representative full team (most recent occurrence) for export.
		const topTeams = [...teamSignatures.entries()]
			.map(([signature, info]) => ({
				signature,
				appearances: info.appearances,
				wins: info.wins,
				winRate: info.appearances ? (info.wins / info.appearances) * 100 : 0,
				team: info.representative,
			}))
			.sort(
				(a, b) =>
					b.appearances - a.appearances ||
					b.winRate - a.winRate ||
					a.signature.localeCompare(b.signature),
			)
			.slice(0, 5);

		categories.push({
			id: categoryId,
			label: config.label,
			displayFormat: config.displayFormat,
			battleStats: {
				totalBattlesAllTime: categoryAll.length,
				battlesLast24h,
				battlesLast7d,
				battlesLast30d,
				averageBattlesPerDay30d: battlesLast30d / 30,
				peakHourOfDay: peakHour,
				averageBattleDurationTurns: categoryRanged.length
					? totalTurns / categoryRanged.length
					: 0,
				forfeitDisconnectRate: categoryRanged.length
					? forfeits / categoryRanged.length
					: 0,
			},
			userLeaderboard: {
				rows: userRows,
				topByBattles,
				topByWinRate,
				topByCurrentWinStreak,
			},
			pokemonUsage: {
				totalTeamSlots,
				pokemon: pokemonRows,
				highestWinRatePokemon: byWinRate[0]
					? {
						species: byWinRate[0].species,
						winRate: byWinRate[0].winRate,
					}
					: null,
				lowestWinRatePokemon: byWinRateAsc[0]
					? {
						species: byWinRateAsc[0].species,
						winRate: byWinRateAsc[0].winRate,
					}
					: null,
				mostVersatilePokemon: byVersatility[0]
					? {
						species: byVersatility[0].species,
						combinations: byVersatility[0].versatilityCount,
					}
					: null,
				mostDominantPokemon: byDominance[0]
					? {
						species: byDominance[0].species,
						dominantScore: byDominance[0].dominantScore,
					}
					: null,
			},
			metaTrends: {
				mostCommonCore: topCoreData,
				topCommonCores,
				mostCommonTeamArchetype: null,
				formatHealthIndicator: formatHealth,
			},
			topTeams,
		});
	}

	return {
		generatedAt: now,
		cacheTtlMs: STATS_CACHE_TTL,
		request: query,
		categories,
	};
}

class BattleStatsStore {
	private records: BattleStatsRecord[] = [];
	private loaded = false;
	private loadingPromise: Promise<void> | null = null;
	private cache = new Map<string, CacheEntry<BattleStatsApiResponse>>();
	private speciesTrendsCache = new Map<string, CacheEntry<SpeciesTrendResult>>();
	private lastReloadCheck = 0;

	/** Index mapping toID(playerName) → records where that player appears.
	 * Built after loading so `?user=…` queries skip scanning all records. */
	private userIndex = new Map<string, BattleStatsRecord[]>();

	// Per-file mtime tracking so reloadIfStale only re-reads files that
	// actually changed.  Archives are immutable after rotation; tracking
	// them individually avoids re-parsing them on every active-file append.
	private fileMtimes = new Map<string, number>();
	/** Number of non-empty lines last parsed from the *active* JSONL file
	 * (identified as the last entry in the sorted file list).  Used by the
	 * incremental fast-path to skip already-loaded records.
	 *
	 * NOTE: this counter is only authoritative in socket-worker processes
	 * (which serve HTTP and never call addRecord).  In the main process
	 * addRecord pushes records without updating it, but that's harmless
	 * because reloadIfStale is never called from the main process. */
	private activeFileLineCount = 0;

	/** Coalesces concurrent cache-miss requests for the same key so only
	 * one aggregation runs regardless of how many callers arrive. */
	private pendingRequests = new Map<string, Promise<any>>();

	/** Lock that serialises reloadIfStale() calls so concurrent cache-miss
	 * requests for different keys don't double-count appended records. */
	private reloadPromise: Promise<void> | null = null;

	/** Lock that serialises aggregateBattleStats calls so concurrent
	 * cache-miss requests for different keys don't multiply CPU load. */
	private aggregateLock: Promise<void> | null = null;

	/**
	 * Ensures persisted battle stat records are loaded into memory.
	 */
	async ensureLoaded() {
		if (this.loaded) return;
		if (this.loadingPromise) return this.loadingPromise;
		this.loadingPromise = (async () => {
			const files = await getStatsFiles();
			if (!files.length) {
				this.loaded = true;
				this.loadingPromise = null;
				return;
			}
			const activeFile = files[files.length - 1];
			for (const file of files) {
				try {
					const stat = await fs.promises.stat(file);
					this.fileMtimes.set(file, stat.mtimeMs);
				} catch {}
				const fileLineCount = await this.parseFileStream(file, this.records);
				if (file === activeFile) this.activeFileLineCount = fileLineCount;
			}
			await this.rebuildUserIndex();
			this.loaded = true;
			this.loadingPromise = null;
		})();
		return this.loadingPromise;
	}

	/**
	 * Re-reads the JSONL file when it has been modified by another process
	 * (e.g. the chat worker that persists new battles). Called before
	 * serving API responses on cache miss so data stays live without
	 * requiring a server restart.
	 *
	 * Uses per-file mtime tracking: when only the active file grew
	 * (the common case of a few appended battles) we read just the new
	 * lines and push them incrementally.  When any archive changed or a
	 * new file appeared (rotation) we fall back to a full reload.
	 *
	 * Serialised via a lock promise so concurrent callers for different
	 * cache keys don't race on the incremental fast-path and double-count
	 * new records.
	 */
	async reloadIfStale() {
		if (this.reloadPromise) return this.reloadPromise;
		this.reloadPromise = this._reloadIfStale();
		try {
			await this.reloadPromise;
		} finally {
			this.reloadPromise = null;
		}
	}

	private async _reloadIfStale() {
		const now = Date.now();
		if (now - this.lastReloadCheck < 5000) return;
		this.lastReloadCheck = now;

		const files = await getStatsFiles();
		if (!files.length) return;

		const activeFile = files[files.length - 1];
		let activeChanged = false;
		let anyArchiveChanged = false;

		// Check for new files and mtime changes on known files.
		for (const file of files) {
			try {
				const stat = await fs.promises.stat(file);
				const prev = this.fileMtimes.get(file);
				if (prev === undefined || stat.mtimeMs > prev) {
					this.fileMtimes.set(file, stat.mtimeMs);
					if (file === activeFile) {
						activeChanged = true;
						// A brand-new active file means rotation happened —
						// we can't know how many lines overlap with existing
						// records so fall through to a full reload.
						if (prev === undefined) anyArchiveChanged = true;
					} else {
						anyArchiveChanged = true;
					}
				}
			} catch {
				// File disappeared (e.g. external cleanup); treat as archive change.
				this.fileMtimes.delete(file);
				anyArchiveChanged = true;
			}
		}

		// Check for files that were previously tracked but are now gone.
		for (const knownFile of this.fileMtimes.keys()) {
			if (!files.includes(knownFile)) {
				anyArchiveChanged = true;
				break;
			}
		}

		if (!activeChanged && !anyArchiveChanged) return;

		if (anyArchiveChanged) {
			// Full reload: rotation happened or archives were touched.
			await this.fullReloadFromFiles(files);
			return;
		}

		// Fast-path: only the active file grew.  Stream only new lines
		// to avoid a synchronous 100MB string split stalling the event loop.
		const newRecords: BattleStatsRecord[] = [];
		const stream = fs.createReadStream(activeFile, { encoding: 'utf-8' });
		const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
		let lineIdx = 0;
		try {
			for await (const line of rl) {
				if (!line.trim()) continue;
				lineIdx++;
				if (lineIdx <= this.activeFileLineCount) {
					if (lineIdx % 5000 === 0)
						await new Promise<void>((r) => setImmediate(r));
					continue;
				}
				try {
					newRecords.push({ endType: 'unknown' as const, ...JSON.parse(line) });
				} catch (e: any) {
					Monitor?.warn?.(
						`Battle stats record parse failure: ${e.message}`,
					);
				}
				// Yield every 5000 new lines so the event loop stays responsive.
				if ((lineIdx - this.activeFileLineCount) % 5000 === 0)
					await new Promise<void>((r) => setImmediate(r));
			}
		} catch (e: any) {
			if (e.code === 'ENOENT') return;
			throw e;
		}
		this.activeFileLineCount = lineIdx;

		if (newRecords.length) {
			for (const rec of newRecords) this.records.push(rec);
			// Incrementally update the user index instead of rebuilding from scratch.
			await this.addToUserIndex(newRecords);
			this.cache.clear();
			this.speciesTrendsCache.clear();
		}
	}

	/**
	 * Re-reads every known JSONL file and replaces the in-memory record
	 * set.  Used on initial load and when archives change (rotation).
	 */
	private async fullReloadFromFiles(files: string[]) {
		const activeFile = files[files.length - 1];
		const newRecords: BattleStatsRecord[] = [];
		for (const file of files) {
			try {
				const stat = await fs.promises.stat(file);
				this.fileMtimes.set(file, stat.mtimeMs);
			} catch {
				this.fileMtimes.delete(file);
			}
			const fileLineCount = await this.parseFileStream(file, newRecords);
			if (file === activeFile) this.activeFileLineCount = fileLineCount;
		}

		// Prune mtime entries for files that no longer exist.
		for (const knownFile of this.fileMtimes.keys()) {
			if (!files.includes(knownFile)) this.fileMtimes.delete(knownFile);
		}

		this.records = newRecords;
		await this.rebuildUserIndex();
		this.cache.clear();
		this.speciesTrendsCache.clear();
	}

	/**
	 * Streams a JSONL file line-by-line into the provided target array,
	 * yielding to the event loop every 5000 lines to avoid blocking
	 * the main thread during full reloads of large files.
	 * Returns the number of non-empty lines parsed.
	 */
	private async parseFileStream(
		file: string,
		target: BattleStatsRecord[],
	): Promise<number> {
		const stream = fs.createReadStream(file, { encoding: 'utf-8' });
		const rl = readline.createInterface({
			input: stream,
			crlfDelay: Infinity,
		});
		let lineCount = 0;
		try {
			for await (const line of rl) {
				if (!line.trim()) continue;
				lineCount++;
				try {
					target.push({
						endType: 'unknown' as const,
						...JSON.parse(line),
					});
				} catch (e: any) {
					Monitor?.warn?.(
						`Battle stats record parse failure: ${e.message}`,
					);
				}
				// Yield to the event loop every 5000 lines so other
				// requests (chat, battles, timers) are not starved.
				if (lineCount % 5000 === 0)
					await new Promise<void>((r) => setImmediate(r));
			}
		} catch (e: any) {
			// File deleted between stat and open (another process rotated it).
			if (e.code === 'ENOENT') return 0;
			throw e;
		}
		return lineCount;
	}

	/**
	 * Rebuilds the user index from scratch by iterating this.records.
	 * Called after initial load and full reloads. For incremental
	 * additions use addToUserIndex instead.
	 */
	private async rebuildUserIndex() {
		this.userIndex.clear();
		await this.addToUserIndex(this.records);
	}

	/**
	 * Adds the given records to the user index without clearing first.
	 * Used for incremental fast-path updates.
	 */
	private async addToUserIndex(records: readonly BattleStatsRecord[]) {
		let yieldCounter = 0;
		for (const record of records) {
			const a = toID(record.playerA);
			const b = toID(record.playerB);
			let arr = this.userIndex.get(a);
			if (!arr) {
				arr = [];
				this.userIndex.set(a, arr);
			}
			arr.push(record);
			if (b !== a) {
				let arrB = this.userIndex.get(b);
				if (!arrB) {
					arrB = [];
					this.userIndex.set(b, arrB);
				}
				arrB.push(record);
			}
			// Yield to the event loop during large full-rebuild passes.
			if (++yieldCounter % 10000 === 0)
				await new Promise<void>((r) => setImmediate(r));
		}
	}

	/**
	 * Returns all records for a specific user, or an empty array if
	 * the user has no battles. Used to skip scanning all records when
	 * a user filter is active.
	 */
	getRecordsForUser(user: string): readonly BattleStatsRecord[] {
		return this.userIndex.get(toID(user)) ?? [];
	}

	/**
	 * Persists a newly completed battle record.
	 * Rotates the active file when it exceeds STATS_ROTATE_SIZE (100 MB),
	 * archiving it with a date-stamped name so the stats page always reads
	 * every record across all files.
	 */
	async addRecord(record: BattleStatsRecord) {
		await this.ensureLoaded();
		this.records.push(record);
		this.activeFileLineCount++;
		await this.addToUserIndex([record]);
		// Cache is intentionally NOT cleared on every battle — battles are
		// frequent and the 5-minute TTL is an acceptable staleness window.
		await FS(STATS_PATH).parentDir().mkdirp();
		await FS(STATS_PATH).append(`${JSON.stringify(record)}\n`);

		// Check whether the active file has grown past the rotation
		// threshold.  If another process already rotated it the stat
		// will throw ENOENT and we safely skip (the next append will
		// recreate the file).
		try {
			const stat = await fs.promises.stat(STATS_PATH);
			this.fileMtimes.set(STATS_PATH, stat.mtimeMs);
			if (stat.size > STATS_ROTATE_SIZE) {
				await this.rotateActiveFile();
			}
		} catch (e: any) {
			// ENOENT: another process already rotated the file — expected.
			// Log anything else so we notice if rotation breaks.
			if (e.code !== 'ENOENT') {
				Monitor?.warn?.(`Battle stats rotation error: ${e.message}`);
			}
		}
	}

	/**
	 * Atomically renames the active JSONL to a date-stamped archive.
	 * Safe to call from multiple processes — the loser sees ENOENT and
	 * returns harmlessly.  When a same-date archive already exists a
	 * numeric suffix is appended ("…-2.jsonl", "…-3.jsonl", …).
	 */
	private async rotateActiveFile() {
		const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
		let archivePath = path.join(STATS_DIR, `battles-${date}.jsonl`);
		let suffix = 1;
		while (true) {
			try {
				await fs.promises.stat(archivePath);
				// File exists, increment suffix and retry
				if (++suffix > 999) return; // safety cap
				archivePath = path.join(STATS_DIR, `battles-${date}-${suffix}.jsonl`);
			} catch (err: any) {
				if (err.code !== 'ENOENT') throw err;
				// File does not exist, safe to rename
				try {
					await fs.promises.rename(STATS_PATH, archivePath);
					return;
				} catch (e: any) {
					if (e.code === 'ENOENT') return; // already rotated by another process
					throw e;
				}
			}
		}
	}

	/**
	 * Returns API stats payload with a 5-minute cache window.
	 * Reloads records from disk when the file has been touched by
	 * another process since the last read (multi-process liveness).
	 * Coalesces concurrent requests for the same key so only one
	 * aggregation runs regardless of how many callers arrive.
	 */
	async getApiResponse(format: string, range: string, user?: string) {
		await this.ensureLoaded();
		const key = `${format}|${range}|${user || ''}`;

		const cached = this.cache.get(key);
		if (cached) {
			if (cached.expiresAt > Date.now()) return cached;
			this.cache.delete(key);
		}

		// If another caller is already computing this key, reuse its promise.
		const pending = this.pendingRequests.get(key) as
			| Promise<CacheEntry<BattleStatsApiResponse>>
			| undefined;
		if (pending) return pending;

		const promise = this.computeApiResponse(key, format, range, user);
		this.pendingRequests.set(key, promise);
		try {
			return await promise;
		} finally {
			this.pendingRequests.delete(key);
		}
	}

	private async computeApiResponse(
		key: string,
		format: string,
		range: string,
		user?: string,
	): Promise<CacheEntry<BattleStatsApiResponse>> {
		await this.reloadIfStale();
		const now = Date.now();
		// When a user filter is active, use the pre-built index to avoid
		// scanning all records. The index is rebuilt after every reload.
		const records = user
			? this.getRecordsForUser(user)
			: this.records;

		// Serialize aggregations so only one runs at a time,
		// preventing thundering-herd CPU multiplication.
		while (this.aggregateLock) await this.aggregateLock;
		let releaseAggregateLock: () => void;
		this.aggregateLock = new Promise<void>((r) => { releaseAggregateLock = r; });
		try {
			const payload = await aggregateBattleStats(records, { format, range, user }, now);
			const json = JSON.stringify(payload);
			const entry = {
				expiresAt: now + STATS_CACHE_TTL,
				payload,
				json,
			};
			this.cache.set(key, entry);
			return entry;
		} finally {
			releaseAggregateLock!();
			this.aggregateLock = null;
		}
	}

	/**
	 * Returns per-species daily usage/win-rate trends with the same
	 * 5-minute cache window used by the main API.
	 * Coalesces concurrent requests for the same key.
	 */
	async getSpeciesTrends(speciesId: string, format: string, range: string, user?: string) {
		await this.ensureLoaded();
		const key = `species-trends|${speciesId}|${format}|${range}|${user || ''}`;

		const cached = this.speciesTrendsCache.get(key);
		if (cached) {
			if (cached.expiresAt > Date.now()) return cached;
			this.speciesTrendsCache.delete(key);
		}

		// If another caller is already computing this key, reuse its promise.
		const pending = this.pendingRequests.get(key) as
			| Promise<CacheEntry<SpeciesTrendResult>>
			| undefined;
		if (pending) return pending;

		const promise = this.computeSpeciesTrends(key, speciesId, format, range, user);
		this.pendingRequests.set(key, promise);
		try {
			return await promise;
		} finally {
			this.pendingRequests.delete(key);
		}
	}

	private async computeSpeciesTrends(
		key: string,
		speciesId: string,
		format: string,
		range: string,
		user?: string,
	): Promise<CacheEntry<SpeciesTrendResult>> {
		await this.reloadIfStale();
		const userFilter = user ? toID(user) : null;
		const normalizedFormat =
			format === "all" ? "all" : normalizeRelumiFormat(format);
		const rangeStart = getRangeStart(range, Date.now());
		const records = user ? this.getRecordsForUser(user) : this.records;
		const matching = normalizedFormat === "all"
			? records
			: normalizedFormat
				? records.filter((r) => r.format === normalizedFormat)
				: [];

		// Serialize aggregations so only one runs at a time,
		// preventing thundering-herd CPU multiplication.
		while (this.aggregateLock) await this.aggregateLock;
		let releaseAggregateLock: () => void;
		this.aggregateLock = new Promise<void>((r) => { releaseAggregateLock = r; });
		try {
			const payload = await aggregateSpeciesTrends(matching, speciesId, rangeStart, userFilter);
			const json = JSON.stringify(payload);
			const entry = {
				expiresAt: Date.now() + STATS_CACHE_TTL,
				payload,
				json,
			};
			this.speciesTrendsCache.set(key, entry);
			return entry;
		} finally {
			releaseAggregateLock!();
			this.aggregateLock = null;
		}
	}

	/**
	 * Read-only accessor for the in-memory records list. Used by one-off
	 * aggregations (e.g. random team) that do not need a cached payload.
	 * Callers that are served over HTTP should call reloadIfStale() first
	 * so records from other processes are visible.
	 */
	getRecords(): readonly BattleStatsRecord[] {
		return this.records;
	}
}

export const BattleStats = new (class {
	private readonly store = new BattleStatsStore();

	/**
	 * Captures a battle completion into the battle stats datastore.
	 */
	async logBattleFromRoomBattle(battle: RoomBattle, winner: ID) {
		if (!shouldLogBattleStats(battle)) return;

		const format = normalizeRelumiFormat(battle.format);
		if (!format) return;

		const [teamA, teamB] = await Promise.all([
			battle.getPlayerTeam(battle.p1),
			battle.getPlayerTeam(battle.p2),
		]);
		if (!teamA || !teamB) return;

		const winnerName = winner
			? [battle.p1, battle.p2].find((player) => player.id === winner)
					?.name || null
			: null;
		const record: BattleStatsRecord = {
			battleId: battle.roomid,
			format,
			timestamp: Date.now(),
			playerA: battle.p1.name,
			playerB: battle.p2.name,
			winner: winnerName,
			// `battle.endType` is set by RoomBattle.forfeitPlayer / similar
			// hooks and is the only reliable signal that a battle ended via
			// forfeit, forced DC/W, or normally. The surviving player is still
			// recorded as `winner` in forfeit cases, so we capture endType here.
			// Cast widens `RoomBattle.endType` ('forfeit'|'forced'|'normal')
			// to include 'unknown' / 'tie' for legacy or BestOf-series records.
			endType: (battle.endType as BattleStatsRecord['endType'] | undefined) ?? 'unknown',
			turns: battle.turn,
			teamA: teamA.map(toBattleStatsPokemon),
			teamB: teamB.map(toBattleStatsPokemon),
		};

		await this.store.addRecord(record);
	}

	/**
	 * Computes the public API payload for the requested filters.
	 */
	getApiResponse(format: string, range: string, user?: string) {
		return this.store.getApiResponse(format, range, user);
	}

	/**
	 * Aggregates per-day usage/win-rate trends for a species over a range.
	 * Format defaults to the single-format filter; pass `all` to span formats.
	 * Results are cached for the same TTL as the main API payload.
	 */
	getSpeciesTrends(speciesId: string, format: string, range: string, user?: string) {
		return this.store.getSpeciesTrends(speciesId, format, range, user);
	}

	/**
	 * Returns a uniformly-random team (BattleStatsPokemon[]) from a random
	 * tracked-format battle. Returns null when no records match.
	 */
	async getRandomTeam(format: string): Promise<BattleStatsPokemon[] | null> {
		await this.store.ensureLoaded();
		await this.store.reloadIfStale();
		const normalizedFormat =
			format === "all" ? "all" : normalizeRelumiFormat(format);
		if (!normalizedFormat) return null;

		const records = this.store.getRecords();
		if (!records.length) return null;

		// Fast-path: format=all skips any scan and picks from all records.
		if (normalizedFormat === "all") return pickRandomTeam(records);

		// Random-sample up to 200 records to avoid an O(n) synchronous
		// scan of the full array. For formats with few battles, this
		// still finds a match quickly; for large populations the odds
		// of missing every probe are vanishingly small.
		const maxAttempts = Math.min(records.length, 200);
		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const idx = Math.floor(Math.random() * records.length);
			const record = records[idx];
			if (record.format === normalizedFormat) {
				return pickRandomTeam([record]);
			}
		}
		return null;
	}
})();

/**
 * Shared HTTP response helper for battle-stats routes. Centralizes CORS
 * headers, content type, and OPTIONS handling so each handler stays thin.
 */
function sendJsonResponse(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	status: number,
	data: AnyObject,
	cacheControl?: string,
) {
	res.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
		"Cache-Control": cacheControl || "no-store",
	});
	res.end(JSON.stringify(data));
}

function sendRawJsonResponse(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	status: number,
	json: string,
	cacheControl?: string,
) {
	res.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
		"Cache-Control": cacheControl || "no-store",
	});
	res.end(json);
}

/**
 * Handles `/api/battlestats` requests from the static HTTP server.
 */
export function maybeHandleBattleStatsRequest(
	req: http.IncomingMessage,
	res: http.ServerResponse,
): boolean {
	const urlString = req.url;
	if (!urlString) return false;
	const url = new URL(urlString, "http://localhost");
	if (url.pathname !== "/api/battlestats") return false;

	const format = toID(url.searchParams.get("format") || "all");
	const range = toID(url.searchParams.get("range") || "all");
	const user = url.searchParams.get("user") || undefined;
	const validFormat = format === "all" || !!normalizeRelumiFormat(format);
	const validRange = ["all", "7d", "30d"].includes(range);

	if (req.method === "OPTIONS") {
		sendJsonResponse(req, res, 204, {});
		return true;
	}

	if (!validFormat || !validRange) {
		sendJsonResponse(req, res, 400, {
			error: "Invalid query. format must be one of tracked relumi formats or all; range must be 7d, 30d, or all.",
		});
		return true;
	}

	void (async () => {
		try {
			const entry = await BattleStats.getApiResponse(format, range, user);
			const maxAge = Math.floor(STATS_CACHE_TTL / 1000);
			sendRawJsonResponse(req, res, 200, entry.json, `public, max-age=${maxAge}, s-maxage=${maxAge}`);
		} catch (e: any) {
			Monitor?.crashlog?.(e, "Battle stats API");
			sendJsonResponse(req, res, 500, { error: "Failed to load battle stats." });
		}
	})();

	return true;
}

/**
 * Handles `/api/battlestats/species-trends` for per-day usage/win-rate line
 * charts in the panel. Returns `{ species, days: [{date, usagePct, winRate}] }`.
 */
export function maybeHandleBattleStatsSpeciesTrendsRequest(
	req: http.IncomingMessage,
	res: http.ServerResponse,
): boolean {
	const urlString = req.url;
	if (!urlString) return false;
	const url = new URL(urlString, "http://localhost");
	if (url.pathname !== "/api/battlestats/species-trends") return false;

	const format = toID(url.searchParams.get("format") || "all");
	const range = toID(url.searchParams.get("range") || "all");
	const species = url.searchParams.get("species") || "";
	const user = url.searchParams.get("user") || undefined;
	const validFormat = format === "all" || !!normalizeRelumiFormat(format);
	const validRange = ["all", "7d", "30d"].includes(range);

	if (req.method === "OPTIONS") {
		sendJsonResponse(req, res, 204, {});
		return true;
	}

	if (!validFormat || !validRange || !species) {
		sendJsonResponse(req, res, 400, {
			error: "Invalid query. species is required; format must be a tracked format or all; range must be 7d, 30d, or all.",
		});
		return true;
	}

	void (async () => {
		try {
			const entry = await BattleStats.getSpeciesTrends(species, format, range, user);
			const maxAge = Math.floor(STATS_CACHE_TTL / 1000);
			sendRawJsonResponse(req, res, 200, entry.json, `public, max-age=${maxAge}, s-maxage=${maxAge}`);
		} catch (e: any) {
			Monitor?.crashlog?.(e, "Battle stats trends API");
			sendJsonResponse(req, res, 500, { error: "Failed to compute species trends." });
		}
	})();

	return true;
}

/**
 * Handles `/api/battlestats/random-team` for the "Random team" panel button.
 * Returns either `{ team: BattleStatsPokemon[] }` or `{ team: null }` when
 * no records are available.
 */
export function maybeHandleBattleStatsRandomTeamRequest(
	req: http.IncomingMessage,
	res: http.ServerResponse,
): boolean {
	const urlString = req.url;
	if (!urlString) return false;
	const url = new URL(urlString, "http://localhost");
	if (url.pathname !== "/api/battlestats/random-team") return false;

	const format = toID(url.searchParams.get("format") || "all");
	const validFormat = format === "all" || !!normalizeRelumiFormat(format);

	if (req.method === "OPTIONS") {
		sendJsonResponse(req, res, 204, {});
		return true;
	}

	if (!validFormat) {
		sendJsonResponse(req, res, 400, {
			error: "Invalid query. format must be a tracked relumi format or all.",
		});
		return true;
	}

	void (async () => {
		try {
			const team = await BattleStats.getRandomTeam(format);
			sendJsonResponse(req, res, 200, { team });
		} catch (e: any) {
			Monitor?.crashlog?.(e, "Battle stats random team API");
			sendJsonResponse(req, res, 500, { error: "Failed to fetch a random team." });
		}
	})();

	return true;
}
