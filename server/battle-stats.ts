import * as http from "http";

import { FS } from "../lib";
import { toID } from "../sim/dex-data";

const runtimeGlobals = globalThis as AnyObject;
const STATS_PATH = runtimeGlobals.Monitor?.logPath
	? runtimeGlobals.Monitor.logPath("battlestats/battles.jsonl").path
	: FS("logs/battlestats/battles.jsonl").path;
const STATS_CACHE_TTL = 5 * 60 * 1000;

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

interface CachedApiResponse {
	expiresAt: number;
	payload: BattleStatsApiResponse;
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
 */
export function aggregateSpeciesTrends(
	records: readonly BattleStatsRecord[],
	speciesId: string,
	rangeStart: number | null,
): SpeciesTrendResult {
	const target = toID(speciesId);
	const filtered =
		rangeStart === null ? records : records.filter((r) => r.timestamp >= rangeStart);

	const dayMap = new Map<string, SpeciesTrendDay>();
	for (const record of filtered) {
		// Bucket by calendar-day (UTC) to keep data comparable across time zones.
		const dayKey = new Date(record.timestamp).toISOString().slice(0, 10);
		let bucket = dayMap.get(dayKey);
		if (!bucket) {
			bucket = { dayKey, appearances: 0, wins: 0, slots: 0 };
			dayMap.set(dayKey, bucket);
		}
		const teams = [
			{
				mons: record.teamA,
				won: !!record.winner && record.winner === record.playerA,
			},
			{
				mons: record.teamB,
				won: !!record.winner && record.winner === record.playerB,
			},
		];
		for (const side of teams) {
			bucket.slots += side.mons.length;
			for (const mon of side.mons) {
				if (toID(mon.species) !== target) continue;
				bucket.appearances++;
				if (side.won) bucket.wins++;
			}
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
 */
export function aggregateBattleStats(
	records: readonly BattleStatsRecord[],
	query: { format: string; range: string; user?: string },
	now = Date.now(),
): BattleStatsApiResponse {
	const normalizedFormat =
		query.format === "all" ? "all" : normalizeRelumiFormat(query.format);
	const rangeStart = getRangeStart(query.range, now);
	// Filter to tracked user if personal stats requested
	const userFilter = query.user ? toID(query.user) : null;
	let filteredRecords = userFilter
		? records.filter((r) => toID(r.playerA) === userFilter || toID(r.playerB) === userFilter)
		: records;
	const allForFormat =
		normalizedFormat === "all"
			? filteredRecords
			: normalizedFormat
				? filteredRecords.filter((r) => r.format === normalizedFormat)
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

	const categories = categoriesToInclude.map((categoryId) => {
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

		const battlesLast24h = categoryAll.filter(
			(r) => r.timestamp >= cutoff24h,
		).length;
		const battlesLast7d = categoryAll.filter(
			(r) => r.timestamp >= cutoff7d,
		).length;
		const battlesLast30d = categoryAll.filter(
			(r) => r.timestamp >= cutoff30d,
		).length;
		const totalTurns = categoryRanged.reduce((sum, r) => sum + r.turns, 0);
		// Forfeits + DC auto-walkovers. `RoomBattle.endType` is set to
		// 'forfeit' by `forfeitPlayer` (manual /forfeit, single-game DC
		// timer, BestOf-series DC overflow) and to 'forced' when a user
		// loses via inappropriate-name rename (room-battle.ts). In both
		// cases the surviving player is still recorded as `winner`, so
		// `!winner` is not a reliable forfeit signal.
		const forfeits = categoryRanged.filter(
			(r) => r.endType === 'forfeit' || r.endType === 'forced',
		).length;

		const hourBuckets = new Array<number>(24).fill(0);
		for (const battle of categoryRanged) {
			hourBuckets[new Date(battle.timestamp).getHours()]++;
		}
		const peakHour = categoryRanged.length
			? hourBuckets.reduce(
					(best, cur, idx) => (cur > hourBuckets[best] ? idx : best),
					0,
				)
			: null;

		const userStats = new Map<
			string,
			{ battles: number; wins: number; currentStreak: number }
		>();
		const timeline = [...categoryRanged].sort(
			(a, b) => a.timestamp - b.timestamp,
		);
		for (const battle of timeline) {
			for (const player of [battle.playerA, battle.playerB]) {
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
			.filter((u) => u.battles >= 20)
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
		for (const battle of categoryRanged) {
			const teams = [
				{
					mons: battle.teamA,
					won: !!battle.winner && battle.winner === battle.playerA,
				},
				{
					mons: battle.teamB,
					won: !!battle.winner && battle.winner === battle.playerB,
				},
			];
			for (const side of teams) {
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
		}

		// Build counter map: for each species, track opposing species
		// and how often the tracked species lost to them
		const counterMap = new Map<string, Map<string, { encounters: number; losses: number }>>();
		for (const battle of categoryRanged) {
			const teams = [
				{
					mons: battle.teamA,
					won: !!battle.winner && battle.winner === battle.playerA,
				},
				{
					mons: battle.teamB,
					won: !!battle.winner && battle.winner === battle.playerB,
				},
			];
			for (const side of teams) {
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
		for (const battle of categoryRanged) {
			users.add(battle.playerA);
			users.add(battle.playerB);
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

		return {
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
		};
	});

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
	private cache = new Map<string, CachedApiResponse>();

	/**
	 * Ensures persisted battle stat records are loaded into memory.
	 */
	async ensureLoaded() {
		if (this.loaded) return;
		if (this.loadingPromise) return this.loadingPromise;
		this.loadingPromise = (async () => {
			const raw = FS(STATS_PATH).readIfExistsSync();
			if (raw) {
				for (const line of raw.split("\n")) {
					if (!line.trim()) continue;						try {
							// Backfill endType for records persisted before the
							// field was added so legacy data still aggregates.
							const parsed = JSON.parse(line);
							this.records.push({ endType: 'unknown', ...parsed });
						} catch (e: any) {
						Monitor?.warn?.(
							`Battle stats record parse failure: ${e.message}`,
						);
					}
				}
			}
			this.loaded = true;
			this.loadingPromise = null;
		})();
		return this.loadingPromise;
	}

	/**
	 * Persists a newly completed battle record.
	 */
	async addRecord(record: BattleStatsRecord) {
		await this.ensureLoaded();
		this.records.push(record);
		this.cache.clear();
		await FS(STATS_PATH).parentDir().mkdirp();
		await FS(STATS_PATH).append(`${JSON.stringify(record)}\n`);
	}

	/**
	 * Returns API stats payload with a 5-minute cache window.
	 */
	async getApiResponse(format: string, range: string, user?: string) {
		await this.ensureLoaded();
		const key = `${format}|${range}|${user || ''}`;
		const cached = this.cache.get(key);
		if (cached && cached.expiresAt > Date.now()) return cached.payload;

		const payload = aggregateBattleStats(this.records, { format, range, user });
		this.cache.set(key, {
			expiresAt: Date.now() + STATS_CACHE_TTL,
			payload,
		});
		return payload;
	}

	/**
	 * Read-only accessor for the in-memory records list. Used by one-off
	 * aggregations (per-species trends, random team) that do not need the
	 * cached API payload.
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
	 */
	async getSpeciesTrends(speciesId: string, format: string, range: string) {
		await this.store.ensureLoaded();
		const normalizedFormat =
			format === "all" ? "all" : normalizeRelumiFormat(format);
		const now = Date.now();
		const rangeStart = getRangeStart(range, now);
		const matching = normalizedFormat === "all"
			? this.store.getRecords()
			: normalizedFormat
				? this.store.getRecords().filter((r) => r.format === normalizedFormat)
				: [];
		return aggregateSpeciesTrends(matching, speciesId, rangeStart);
	}

	/**
	 * Returns a uniformly-random team (BattleStatsPokemon[]) from a random
	 * tracked-format battle. Returns null when no records match.
	 */
	async getRandomTeam(format: string): Promise<BattleStatsPokemon[] | null> {
		await this.store.ensureLoaded();
		const normalizedFormat =
			format === "all" ? "all" : normalizeRelumiFormat(format);
		const records = this.store.getRecords();
		const matching = normalizedFormat === "all"
			? records
			: normalizedFormat
				? records.filter((r) => r.format === normalizedFormat)
				: [];
		return pickRandomTeam(matching);
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
) {
	res.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
		"Cache-Control": "no-store",
	});
	res.end(JSON.stringify(data));
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
			const payload = await BattleStats.getApiResponse(format, range, user);
			sendJsonResponse(req, res, 200, payload);
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
			const payload = await BattleStats.getSpeciesTrends(species, format, range);
			sendJsonResponse(req, res, 200, payload);
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
