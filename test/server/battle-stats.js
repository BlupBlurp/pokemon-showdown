"use strict";

const assert = require("assert").strict;

const {
	aggregateBattleStats,
	normalizeRelumiFormat,
} = require("../../dist/server/battle-stats");

describe("Battle stats aggregation", () => {
	it("normalizes tracked formats and skips testing formats", () => {
		assert.equal(
			normalizeRelumiFormat("gen8relumirandombattle"),
			"gen8relumirandombattle",
		);
		assert.equal(normalizeRelumiFormat("Gen8RelumiSinglesTesting"), null);
		assert.equal(normalizeRelumiFormat("gen9ou"), null);
	});

	it("aggregates battle, user, and pokemon usage stats", () => {
		const now = Date.UTC(2026, 2, 24, 12, 0, 0);
		const hour = 60 * 60 * 1000;

		const records = [
			{
				battleId: "battle-a",
				format: "gen8relumirandombattle",
				timestamp: now - 2 * hour,
				playerA: "Alice",
				playerB: "Bob",
				winner: "Alice",
				turns: 18,
				teamA: [
					{
						species: "Pikachu",
						ability: "Static",
						item: "Light Ball",
						moves: ["Volt Tackle", "Surf"],
						ivs: {},
						evs: {},
					},
					{
						species: "Garchomp",
						ability: "Rough Skin",
						item: "Rocky Helmet",
						moves: ["Earthquake"],
						ivs: {},
						evs: {},
					},
				],
				teamB: [
					{
						species: "Pikachu",
						ability: "Lightning Rod",
						item: "Focus Sash",
						moves: ["Thunderbolt"],
						ivs: {},
						evs: {},
					},
					{
						species: "Blastoise",
						ability: "Torrent",
						item: "Leftovers",
						moves: ["Scald"],
						ivs: {},
						evs: {},
					},
				],
			},
			{
				battleId: "battle-b",
				format: "gen8relumirandombattle",
				timestamp: now - 28 * hour,
				playerA: "Alice",
				playerB: "Cara",
				winner: null,
				turns: 25,
				teamA: [
					{
						species: "Pikachu",
						ability: "Static",
						item: "Life Orb",
						moves: ["Volt Tackle"],
						ivs: {},
						evs: {},
					},
				],
				teamB: [
					{
						species: "Garchomp",
						ability: "Rough Skin",
						item: "Yache Berry",
						moves: ["Earthquake"],
						ivs: {},
						evs: {},
					},
				],
			},
			{
				battleId: "battle-c",
				format: "gen8relumidoubles",
				timestamp: now - 6 * hour,
				playerA: "Dexter",
				playerB: "Eve",
				winner: "Eve",
				turns: 12,
				teamA: [
					{
						species: "Charizard",
						ability: "Blaze",
						item: "Heavy-Duty Boots",
						moves: ["Flamethrower"],
						ivs: {},
						evs: {},
					},
				],
				teamB: [
					{
						species: "Milotic",
						ability: "Competitive",
						item: "Leftovers",
						moves: ["Scald"],
						ivs: {},
						evs: {},
					},
				],
			},
		];

		const payload = aggregateBattleStats(
			records,
			{ format: "all", range: "30d" },
			now,
		);

		assert.equal(payload.categories.length, 4);
		const randomSingles = payload.categories.find(
			(c) => c.id === "random-singles",
		);
		assert(randomSingles);
		assert.equal(randomSingles.battleStats.totalBattlesAllTime, 2);
		assert.equal(randomSingles.battleStats.battlesLast24h, 1);
		assert.equal(randomSingles.battleStats.battlesLast30d, 2);
		assert.equal(randomSingles.battleStats.averageBattleDurationTurns, 21.5);

		assert.equal(randomSingles.userLeaderboard.topByBattles[0].user, "Alice");
		assert.equal(randomSingles.userLeaderboard.topByBattles[0].battles, 2);

		assert.equal(randomSingles.pokemonUsage.pokemon[0].species, "Pikachu");
		assert.equal(randomSingles.pokemonUsage.pokemon[0].appearances, 3);
		assert.equal(
			randomSingles.metaTrends.mostCommonCore.pokemonA,
			"garchomp",
		);
		assert.equal(randomSingles.metaTrends.mostCommonCore.pokemonB, "pikachu");
		assert.equal(randomSingles.metaTrends.topCommonCores[0].count, 2);

		const doubles = payload.categories.find((c) => c.id === "doubles");
		assert(doubles);
		assert.equal(doubles.battleStats.totalBattlesAllTime, 1);
		assert.equal(doubles.userLeaderboard.topByBattles[0].user, "Dexter");
	});
});
