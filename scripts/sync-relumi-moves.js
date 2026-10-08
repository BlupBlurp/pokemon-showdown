"use strict";

const { TYPE_ID_TO_NAME } = require("./lib/bdsp-type-id-to-name");
const { compareJson } = require("./lib/relumi-deep-sort");
const { MANUAL_MOVE_OVERRIDES, FLAG_OVERRIDES } = require("./lib/relumi-move-overrides");

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

// There are a few more but I don't think they will actually be used
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
	const effectsByChance = {};

	if (row.category === 6 || row.category === 7) {
		// up to 3 rank effects per move
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

			// allStats expands to the five individual stats
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

	// effects array from the chance-grouped boosts
	for (const chanceStr of Object.keys(effectsByChance)) {
		const chance = parseInt(chanceStr);
		const boosts = effectsByChance[chance];
		const effect = { chance };

		// category 7 = user stat change
		if (row.category === 7) {
			effect.self = { boosts };
		} else {
			effect.boosts = boosts;
		}

		effects.push(effect);
	}

	if (row.category === 4 && row.sickID && row.sickPer) {
		let statusName = SICK_ID_TO_STATUS[row.sickID];
		// sickID 5 + duration 15 = toxic, not regular poison
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

	// shrinkPer of 1 isn't a real flinch chance, ignore it
	if (row.shrinkPer && row.shrinkPer > 1) {
		effects.push({
			chance: row.shrinkPer,
			volatileStatus: "flinch",
		});
	}

	if (effects.length === 0) return null;

	// a lone 100% user stat change is a direct self object, no wrapper
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

		// no Z/Max moves in synced data
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

		// power === 1 is the game-file sentinel for variable/fixed power
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

		// target mapping from the numeric source codes is disabled: the codes
		// are overloaded and generate noisy overrides

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
			// ignored: Showdown handles max HP healing and recoil in code, so
			// emitting them here creates false positives
		}

		// rank effects (stat boosts/debuffs) from the game file
		const rankEffects = extractRankEffects(row);
		if (rankEffects) {
			// direct self effect: 100% user stat change, no secondary wrapper
			if (rankEffects.self && !rankEffects.chance) {
				let isUnchanged = false;

				// vs move.self
				if (compareJson(rankEffects.self, move.self)) {
					isUnchanged = true;
				} else if (
					// vs secondary wrapper (100% chance), equivalent
					move.secondary &&
					move.secondary.chance === 100 &&
					compareJson(rankEffects.self, move.secondary.self)
				) {
					isUnchanged = true;
				} else if (
					// vs move.selfBoost
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
				// several effects, different chances
				if (!compareJson(rankEffects, move.secondaries)) {
					updates.secondaries = rankEffects;
					changed = true;
				}
			} else {
				// single effect with a chance field
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

	// hardcoded flag overrides not present in the source tables but needed
	// for Relumi's gen 9 behavior
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
