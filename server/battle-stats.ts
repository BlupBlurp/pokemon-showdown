import * as http from "http";

import { FS } from "../lib";
import { toID } from "../sim/dex-data";

const runtimeGlobals = globalThis as AnyObject;
const STATS_PATH = runtimeGlobals.Monitor?.logPath
	? runtimeGlobals.Monitor.logPath("battlestats/battles.jsonl").path
	: FS("logs/battlestats/battles.jsonl").path;
const STATS_CACHE_TTL = 5 * 60 * 1000;

export const RELUMI_TRACKED_FORMATS = [
	"gen8relumirandomsingles",
	"gen8relumirandomdoubles",
	"gen8relumisinglesanythinggoes",
	"gen8relumisinglesubers",
	"gen8relumisinglesou",
	"gen8relumidoublesanythinggoes",
	"gen8relumidoublesubers",
	"gen8relumidoublesou",
] as const;

export type RelumiTrackedFormat = (typeof RELUMI_TRACKED_FORMATS)[number];

export type StatsCategoryId =
	| "random-singles"
	| "random-doubles"
	| "singles"
	| "doubles";

export interface BattleStatsPokemon {
	species: string;
	ability: string;
	item: string;
	moves: string[];
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
}

export interface BattleStatsApiResponse {
	generatedAt: number;
	cacheTtlMs: number;
	request: { format: string; range: string };
	categories: CategoryOutput[];
}

const CATEGORY_CONFIG: Record<
	StatsCategoryId,
	{ label: string; displayFormat: string; formats: RelumiTrackedFormat[] }
> = {
	"random-singles": {
		label: "Random Singles",
		displayFormat: "[Gen 8] Relumi Random Singles",
		formats: ["gen8relumirandomsingles"],
	},
	"random-doubles": {
		label: "Random Doubles",
		displayFormat: "[Gen 8] Relumi Random Doubles",
		formats: ["gen8relumirandomdoubles"],
	},
	singles: {
		label: "Singles",
		displayFormat: "[Gen 8] Relumi Singles (AG/Ubers/OU)",
		formats: [
			"gen8relumisinglesanythinggoes",
			"gen8relumisinglesubers",
			"gen8relumisinglesou",
		],
	},
	doubles: {
		label: "Doubles",
		displayFormat: "[Gen 8] Relumi Doubles (AG/Ubers/OU)",
		formats: [
			"gen8relumidoublesanythinggoes",
			"gen8relumidoublesubers",
			"gen8relumidoublesou",
		],
	},
};

const CATEGORY_IDS: StatsCategoryId[] = [
	"random-singles",
	"random-doubles",
	"singles",
	"doubles",
];

const FORMAT_TO_CATEGORY: Record<RelumiTrackedFormat, StatsCategoryId> = {
	gen8relumirandomsingles: "random-singles",
	gen8relumirandomdoubles: "random-doubles",
	gen8relumisinglesanythinggoes: "singles",
	gen8relumisinglesubers: "singles",
	gen8relumisinglesou: "singles",
	gen8relumidoublesanythinggoes: "doubles",
	gen8relumidoublesubers: "doubles",
	gen8relumidoublesou: "doubles",
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

function topCounts(
	counts: Map<string, number>,
	denominator: number,
	limit: number,
): PokemonCount[] {
	if (!denominator) return [];
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, limit)
		.map(([name, count]) => ({
			name,
			count,
			pct: (count / denominator) * 100,
		}));
}

/**
 * Aggregates battle records into the API response payload.
 */
export function aggregateBattleStats(
	records: readonly BattleStatsRecord[],
	query: { format: string; range: string },
	now = Date.now(),
): BattleStatsApiResponse {
	const normalizedFormat =
		query.format === "all" ? "all" : normalizeRelumiFormat(query.format);
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
		const forfeits = categoryRanged.filter((r) => !r.winner).length;

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
				abilityCounts: Map<string, number>;
				itemCounts: Map<string, number>;
				moveCounts: Map<string, number>;
				combinations: Set<string>;
			}
		>();
		const pairCounts = new Map<string, number>();
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
					entry.abilityCounts.set(
						ability,
						(entry.abilityCounts.get(ability) || 0) + 1,
					);
					entry.itemCounts.set(
						item,
						(entry.itemCounts.get(item) || 0) + 1,
					);
					for (const move of mon.moves || []) {
						entry.moveCounts.set(
							move,
							(entry.moveCounts.get(move) || 0) + 1,
						);
					}
					const comboMoves = [...(mon.moves || [])]
						.map(toID)
						.sort()
						.join(",");
					entry.combinations.add(
						`${toID(ability)}|${toID(item)}|${comboMoves}`,
					);
				}
			}
		}

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
					if (!line.trim()) continue;
					try {
						this.records.push(JSON.parse(line));
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
	async getApiResponse(format: string, range: string) {
		await this.ensureLoaded();
		const key = `${format}|${range}`;
		const cached = this.cache.get(key);
		if (cached && cached.expiresAt > Date.now()) return cached.payload;

		const payload = aggregateBattleStats(this.records, { format, range });
		this.cache.set(key, {
			expiresAt: Date.now() + STATS_CACHE_TTL,
			payload,
		});
		return payload;
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
			turns: battle.turn,
			teamA: teamA.map(toBattleStatsPokemon),
			teamB: teamB.map(toBattleStatsPokemon),
		};

		await this.store.addRecord(record);
	}

	/**
	 * Computes the public API payload for the requested filters.
	 */
	getApiResponse(format: string, range: string) {
		return this.store.getApiResponse(format, range);
	}
})();

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
	const validFormat = format === "all" || !!normalizeRelumiFormat(format);
	const validRange = ["all", "7d", "30d"].includes(range);

	const respond = (status: number, data: AnyObject) => {
		res.writeHead(status, {
			"Content-Type": "application/json; charset=utf-8",
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
			"Cache-Control": "no-store",
		});
		res.end(JSON.stringify(data));
	};

	if (req.method === "OPTIONS") {
		respond(204, {});
		return true;
	}

	if (!validFormat || !validRange) {
		respond(400, {
			error: "Invalid query. format must be one of tracked relumi formats or all; range must be 7d, 30d, or all.",
		});
		return true;
	}

	void (async () => {
		try {
			const payload = await BattleStats.getApiResponse(format, range);
			respond(200, payload);
		} catch (e: any) {
			Monitor?.crashlog?.(e, "Battle stats API");
			respond(500, { error: "Failed to load battle stats." });
		}
	})();

	return true;
}
