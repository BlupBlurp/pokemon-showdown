"use strict";

const TYPE_ID_TO_NAME = [
	"Normal",
	"Fighting",
	"Flying",
	"Poison",
	"Ground",
	"Rock",
	"Bug",
	"Ghost",
	"Steel",
	"Fire",
	"Water",
	"Grass",
	"Electric",
	"Psychic",
	"Ice",
	"Dragon",
	"Dark",
	"Fairy",
];

const DAMAGE_TYPE_TO_CATEGORY = {
	0: "Status",
	1: "Physical",
	2: "Special",
};

const FLAG_BITS = [
	"contact",
	"charge",
	"recharge",
	"protect",
	"reflectable",
	"snatch",
	"mirror",
	"punch",
	"sound",
	"gravity",
	"defrost",
	"distance",
	"heal",
	"bypasssub",
	"nonsky",
	"allyanim",
	"dance",
	"metronome",
];

const RANK_EFF_TYPE_TO_STAT = [
	null,
	"atk",
	"def",
	"spa",
	"spd",
	"spe",
	"accuracy",
	"evasion",
	"allStats",
];

const FLAG_OVERRIDES = {
	// Sharpness moves (slicing flag)
	smartstrike: { slicing: 1 },
	shadowclaw: { slicing: 1 },
	dragonclaw: { slicing: 1 },
	metalclaw: { slicing: 1 },
	crushclaw: { slicing: 1 },
	// Mega Launcher moves (pulse flag)
	flashcannon: { pulse: 1 },
	armorcannon: { pulse: 1 },
};

// Manual and hardcoded move overrides that should persist across sync runs.
const MANUAL_MOVE_OVERRIDES = {
	hail: {
		name: "Snowscape",
		shortDesc: "For 5 turns, snow begins to fall.",
		weather: "snowscape",
	},
	maxhailstorm: {
		weather: "snowscape",
	},
	snowscape: {
		gen: 8,
		isNonstandard: null,
	},
	chillyreception: {
		gen: 8,
		isNonstandard: null,
	},
	triplearrows: {
		shortDesc: "High crit. Target: 50% -1 Sp. Defense, 30% flinch.",
	},
	cut: {
		shortDesc: "High critical hit ratio.",
	},
	dragonhammer: {
		desc: "If the target lost HP, the user takes recoil damage equal to 1/3 the HP lost by the target, rounded half up, but not less than 1 HP.",
		shortDesc: "Has 33% recoil.",
	},
	mirrorshot: {
		desc: "Has a 30% chance to lower the target's speed by 1 stage.",
		shortDesc: "30% chance to lower the target's speed by 1.",
	},
	mudbomb: {
		desc: "Has a 30% chance to lower the target's speed by 1 stage.",
		shortDesc: "30% chance to lower the target's speed by 1.",
	},
	muddywater: {
		desc: "Has a 30% chance to lower the target's speed by 1 stage.",
		shortDesc: "30% chance to lower the foe(s) speed by 1.",
	},
	mudslap: {
		desc: "Has a 100% chance to lower the target's speed by 2 stages.",
		shortDesc: "100% chance to lower the target's speed by 2.",
	},
	rockclimb: {
		desc: "Has a 10% chance to confuse the target.",
		shortDesc: "10% chance to confuse the target.",
	},
	submission: {
		desc: "If the target lost HP, the user takes recoil damage equal to 1/3 the HP lost by the target, rounded half up, but not less than 1 HP.",
		shortDesc: "Has 1/3 recoil.",
	},
};

function gcd(a, b) {
	let x = Math.abs(a);
	let y = Math.abs(b);
	while (y) {
		const remainder = x % y;
		x = y;
		y = remainder;
	}
	return x || 1;
}

function fractionFromPercent(percent) {
	const denominator = 100;
	const divisor = gcd(percent, denominator);
	return [percent / divisor, denominator / divisor];
}

function compareJson(a, b) {
	return JSON.stringify(a) === JSON.stringify(b);
}

function buildMoveFlags(rawFlags, baseFlags = {}) {
	const flags = { ...baseFlags };
	for (let bit = 0; bit < FLAG_BITS.length; bit++) {
		const flagName = FLAG_BITS[bit];
		if (rawFlags & (1 << bit)) {
			flags[flagName] = 1;
		}
	}
	return flags;
}

const SICK_ID_TO_STATUS = {
	1: "par",
	2: "slp",
	3: "frz",
	4: "brn",
	5: "psn",
	6: "confusion",
};

// Extract secondary effects (stat boosts, status, flinch) from game file fields.
function extractRankEffects(row) {
	// Map chance -> boosts object for grouping rank effects by chance
	const effectsByChance = {};

	if (row.category === 6 || row.category === 7) {
		// Process up to 3 rank effects per move
		for (let i = 1; i <= 3; i++) {
			const effType = row[`rankEffType${i}`];
			const effValue = row[`rankEffValue${i}`];
			const effPer = row[`rankEffPer${i}`];

			// Skip if no valid effect type
			if (!effType || effType === 0) continue;

			// Stat name mapping
			const statName = RANK_EFF_TYPE_TO_STAT[effType];
			if (!statName) continue;

			const chance = effPer || 100;
			if (!effectsByChance[chance]) {
				effectsByChance[chance] = {};
			}

			// If stat is "allStats", expand to all individual stats
			if (statName === "allStats") {
				Object.assign(effectsByChance[chance], {
					atk: effValue,
					def: effValue,
					spa: effValue,
					spd: effValue,
					spe: effValue,
				});
			} else {
				effectsByChance[chance][statName] = effValue;
			}
		}
	}

	const effects = [];

	// Build effects array from grouped boosts
	for (const chanceStr of Object.keys(effectsByChance)) {
		const chance = parseInt(chanceStr);
		const boosts = effectsByChance[chance];
		const effect = { chance };

		// Category 7 = user stats change, use self wrapper
		if (row.category === 7) {
			effect.self = { boosts };
		} else {
			effect.boosts = boosts;
		}

		effects.push(effect);
	}

	if (row.category === 4 && row.sickID && row.sickPer) {
		let statusName = SICK_ID_TO_STATUS[row.sickID];
		// Special case: Toxic poison uses sickID 5 with duration 15
		if (row.sickID === 5 && row.sickTurnMin === 15 && row.sickTurnMax === 15) {
			statusName = "tox";
		}
		if (statusName) {
			const effect = { chance: row.sickPer };
			if (statusName === "confusion") {
				effect.volatileStatus = statusName;
			} else {
				effect.status = statusName;
			}
			effects.push(effect);
		}
	}

	// Chance of 1 to flinch is a special case, so we ignore it.
	if (row.shrinkPer && row.shrinkPer > 1) {
		effects.push({
			chance: row.shrinkPer,
			volatileStatus: "flinch",
		});
	}

	if (effects.length === 0) return null;

	// Special case: 100% user stat change with single chance level
	// Return as direct self object without secondary wrapper
	if (effects.length === 1 && effects[0].chance === 100 && row.category === 7 && effects[0].self) {
		return {
			self: {
				boosts: effects[0].self.boosts,
			},
		};
	}

	return effects.length === 1 ? effects[0] : effects;
}

function buildMoveDiffs({ moveNames, wazaRows, dex }) {
	const movesDiffs = {};
	const unmappedMoves = [];

	for (const row of wazaRows) {
		if (!row || row.isValid !== 1) continue;
		if (!row.wazaNo || row.wazaNo <= 0) continue;
		const moveName = (moveNames.get(row.wazaNo) || "").trim();
		if (!moveName || moveName === "———") continue;

		const move = dex.moves.get(moveName);
		if (!move.exists) {
			unmappedMoves.push({ wazaNo: row.wazaNo, moveName });
			continue;
		}

		// Relumi does not use Z-Moves / Max Moves in synced move data.
		if (move.isZ || move.isMax) continue;

		const updates = { inherit: true };
		let changed = false;

		const type = TYPE_ID_TO_NAME[row.type] || move.type;
		if (type && type !== move.type) {
			updates.type = type;
			changed = true;
		}

		const category = DAMAGE_TYPE_TO_CATEGORY[row.damageType];
		if (category && category !== move.category) {
			updates.category = category;
			changed = true;
		}

		// `power === 1` is a game-file sentinel for variable/fixed power behavior.
		if (
			typeof row.power === "number" &&
			row.power !== 1 &&
			row.power !== move.basePower
		) {
			updates.basePower = row.power;
			changed = true;
		}

		const accuracy = row.hitPer === 0 || row.hitPer === 101 ? true : row.hitPer;
		if (accuracy !== move.accuracy) {
			updates.accuracy = accuracy;
			changed = true;
		}

		if (typeof row.basePP === "number" && row.basePP !== move.pp) {
			updates.pp = row.basePP;
			changed = true;
		}

		if (typeof row.priority === "number" && row.priority !== move.priority) {
			updates.priority = row.priority;
			changed = true;
		}

		// Target mapping from source numeric codes is intentionally disabled for now.
		// The codes are overloaded and can introduce noisy/incorrect overrides.

		if (row.hitCountMax > 1 || row.hitCountMin > 1) {
			let multihit;
			if (row.hitCountMin === row.hitCountMax) {
				multihit = row.hitCountMax;
			} else {
				multihit = [row.hitCountMin, row.hitCountMax];
			}
			if (!compareJson(multihit, move.multihit)) {
				updates.multihit = multihit;
				changed = true;
			}
		}

		if (row.criticalRank === 6) {
			if (!move.willCrit) {
				updates.willCrit = true;
				changed = true;
			}
		} else if (row.criticalRank > 0) {
			const critRatio = row.criticalRank + 1;
			if (critRatio !== move.critRatio) {
				updates.critRatio = critRatio;
				changed = true;
			}
		}

		if (row.damageRecoverRatio) {
			const fraction = fractionFromPercent(Math.abs(row.damageRecoverRatio));
			if (row.damageRecoverRatio > 0) {
				if (!compareJson(fraction, move.drain)) {
					updates.drain = fraction;
					changed = true;
				}
			} else {
				if (!compareJson(fraction, move.recoil)) {
					updates.recoil = fraction;
					changed = true;
				}
			}
		}

		if (row.hpRecoverRatio) {
			// Intentionally ignored. Showdown handles max HP healing and recoil natively via code, so emitting them creates false positives.
		}

		// Extract rank effects (stat boosts/debuffs) from game file data.
		const rankEffects = extractRankEffects(row);
		if (rankEffects) {
			// Check if this is a direct self effect (100% user stat change, no secondary wrapper)
			if (rankEffects.self && !rankEffects.chance) {
				let isUnchanged = false;

				// Check 1: Compare against direct move.self
				if (compareJson(rankEffects.self, move.self)) {
					isUnchanged = true;
				} else if (
					// Check 2: Compare against secondary wrapper (100% chance) - semantically equivalent
					move.secondary &&
					move.secondary.chance === 100 &&
					compareJson(rankEffects.self, move.secondary.self)
				) {
					isUnchanged = true;
				} else if (
					// Check 3: Compare against move.selfBoost
					compareJson(rankEffects.self, move.selfBoost)
				) {
					isUnchanged = true;
				}

				if (!isUnchanged) {
					if (move.selfBoost) {
						updates.selfBoost = rankEffects.self;
					} else {
						updates.self = rankEffects.self;
					}
					changed = true;
				}
			} else if (Array.isArray(rankEffects)) {
				// Multiple effects with different chances
				if (!compareJson(rankEffects, move.secondaries)) {
					updates.secondaries = rankEffects;
					changed = true;
				}
			} else {
				// Single effect with chance field
				let isUnchanged = false;

				if (compareJson(rankEffects, move.secondary)) {
					isUnchanged = true;
				} else if (
					rankEffects.self &&
					rankEffects.chance &&
					move.self &&
					move.self.chance === rankEffects.chance &&
					compareJson(rankEffects.self.boosts, move.self.boosts)
				) {
					isUnchanged = true;
				}

				if (!isUnchanged) {
					if (rankEffects.self && move.self && move.self.chance) {
						updates.self = {
							chance: rankEffects.chance,
							boosts: rankEffects.self.boosts,
						};
						updates.secondary = {}; // Sheer Force stub
					} else {
						updates.secondary = rankEffects;
					}
					changed = true;
				}
			}
		}

		const baseFlags = move.flags || {};
		const mergedFlags = buildMoveFlags(row.flags || 0, baseFlags);
		for (const [moveId, flagAdds] of Object.entries(FLAG_OVERRIDES)) {
			if (move.id !== moveId) continue;
			Object.assign(mergedFlags, flagAdds);
		}
		if (!compareJson(mergedFlags, baseFlags)) {
			updates.flags = mergedFlags;
			changed = true;
		}

		if (changed) movesDiffs[move.id] = updates;
	}

	// Apply hardcoded overrides that are not represented in the source tables
	// but need to persist in Showdown for Relumi's Gen 9 behavior.
	for (const [moveId, flagAdds] of Object.entries(FLAG_OVERRIDES)) {
		const move = dex.moves.get(moveId);
		if (!move.exists) continue;
		if (!movesDiffs[move.id]) movesDiffs[move.id] = { inherit: true };
		const currentFlags = movesDiffs[move.id].flags || move.flags || {};
		movesDiffs[move.id].flags = { ...currentFlags, ...flagAdds };
	}

	for (const [moveId, override] of Object.entries(MANUAL_MOVE_OVERRIDES)) {
		const move = dex.moves.get(moveId);
		if (!move.exists) continue;
		if (!movesDiffs[move.id]) movesDiffs[move.id] = { inherit: true };
		Object.assign(movesDiffs[move.id], override);
	}

	return { movesDiffs, unmappedMoves };
}

module.exports = { buildMoveDiffs };
