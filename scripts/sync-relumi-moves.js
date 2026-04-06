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
		secondaries: [
			{
				chance: 50,
				boosts: { spd: -1 },
			},
			{
				chance: 30,
				volatileStatus: "flinch",
			},
		],
	},
	cut: {
		shortDesc: "High critical hit ratio.",
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
			}
		}

		if (row.hpRecoverRatio) {
			// Intentionally ignored for now.
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
