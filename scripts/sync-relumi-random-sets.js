"use strict";

const fs = require("fs");

const RECOVERY_MOVES = new Set([
	"healorder",
	"milkdrink",
	"moonlight",
	"morningsun",
	"recover",
	"rest",
	"roost",
	"shoreup",
	"slackoff",
	"softboiled",
	"strengthsap",
	"synthesis",
	"wish",
]);

const SETUP_MOVES = new Set([
	"agility",
	"bellydrum",
	"bulkup",
	"calmmind",
	"coil",
	"curse",
	"dragondance",
	"growth",
	"honeclaws",
	"irondefense",
	"nastyplot",
	"quiverdance",
	"rockpolish",
	"shellsmash",
	"swordsdance",
	"trailblaze",
	"workup",
]);

const HAZARD_MOVES = new Set([
	"spikes",
	"stealthrock",
	"stickyweb",
	"toxicspikes",
]);

const DOUBLES_SUPPORT_MOVES = new Set([
	"allyswitch",
	"fakeout",
	"followme",
	"helpinghand",
	"icywind",
	"quickguard",
	"ragepowder",
	"reflect",
	"lightscreen",
	"tailwind",
	"trickroom",
	"wideguard",
]);

const SINGLES_SUPPORT_MOVES = new Set([
	"defog",
	"encore",
	"haze",
	"knockoff",
	"partingshot",
	"rapidspin",
	"taunt",
	"toxic",
	"toxicthread",
	"trick",
	"uturn",
	"voltswitch",
	"willowisp",
]);

const MIN_NON_DITTO_MOVES = 3;
const MAX_GENERATED_SETS_PER_SPECIES = 3;
const MAX_TRAINER_ID = 2000;
const EV_CAP = 510;
const EV_STAT_CAP = 252;
const FALLBACK_BASE_ONLY_SPECIES = new Set([
	"alcremie",
	"furfrou",
	"minior",
	"vivillon",
]);
const TRAINER_FORM_NUMBER_SPECIES_OVERRIDES = {
	25: {
		1: "Pikachu-Cosplay",
		2: "Pikachu-Rock-Star",
		3: "Pikachu-Belle",
		4: "Pikachu-Pop-Star",
		5: "Pikachu-PhD",
		6: "Pikachu-Libre",
		7: "Pikachu-Original",
		8: "Pikachu-Starter",
		9: "Pikachu-Gmax",
		10: "Pikachu-Clone",
	},
	892: {
		0: "Urshifu",
		1: "Urshifu-Rapid-Strike",
		2: "Urshifu-Gmax",
		3: "Urshifu-Rapid-Strike-Gmax",
	},
};
const STRICT_TRAINER_FORM_SPECIES = new Set(
	Object.keys(TRAINER_FORM_NUMBER_SPECIES_OVERRIDES).map(n => Number(n))
);
const NATURE_NAMES_BY_ID = [
	"Hardy",
	"Lonely",
	"Brave",
	"Adamant",
	"Naughty",
	"Bold",
	"Docile",
	"Relaxed",
	"Impish",
	"Lax",
	"Timid",
	"Hasty",
	"Serious",
	"Jolly",
	"Naive",
	"Modest",
	"Mild",
	"Quiet",
	"Bashful",
	"Rash",
	"Calm",
	"Gentle",
	"Sassy",
	"Careful",
	"Quirky",
];

function toId(text) {
	return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function clampStatEv(value) {
	const n = Number(value);
	if (!Number.isFinite(n)) return 0;
	return clamp(Math.trunc(n), 0, EV_STAT_CAP);
}

function normalizeTrainerEvs(rawEvs, species) {
	const evs = {
		hp: clampStatEv(rawEvs.hp),
		atk: clampStatEv(rawEvs.atk),
		def: clampStatEv(rawEvs.def),
		spa: clampStatEv(rawEvs.spa),
		spd: clampStatEv(rawEvs.spd),
		spe: clampStatEv(rawEvs.spe),
	};

	const totalEvs = () =>
		evs.hp + evs.atk + evs.def + evs.spa + evs.spd + evs.spe;

	let total = totalEvs();
	if (total > EV_CAP) {
		const trimOrder = ["hp", "atk", "spa", "def", "spd", "spe"];
		for (const stat of trimOrder) {
			if (total <= EV_CAP) break;
			const overflow = total - EV_CAP;
			const cut = Math.min(overflow, evs[stat]);
			evs[stat] -= cut;
			total -= cut;
		}
	}

	total = totalEvs();
	if (total < EV_CAP) {
		const existingPriority = Object.keys(evs)
			.filter(stat => evs[stat] > 0)
			.sort((a, b) => evs[b] - evs[a]);
		let offensivePriority = ["spa", "spe", "hp", "atk", "def", "spd"];
		if (species.baseStats.atk >= species.baseStats.spa) {
			offensivePriority = ["atk", "spe", "hp", "spa", "def", "spd"];
		}
		const statOrder = [];
		for (const stat of [...existingPriority, ...offensivePriority]) {
			if (!statOrder.includes(stat)) statOrder.push(stat);
		}

		let progressed = true;
		while (total < EV_CAP && progressed) {
			progressed = false;
			for (const stat of statOrder) {
				if (total >= EV_CAP) break;
				const room = EV_STAT_CAP - evs[stat];
				if (room <= 0) continue;
				const remaining = EV_CAP - total;
				const add = Math.min(room, remaining >= 4 ? 4 : remaining);
				if (add <= 0) continue;
				evs[stat] += add;
				total += add;
				progressed = true;
			}
		}
	}

	return evs;
}

function buildItemNameByNo(dex) {
	const itemNameByNo = new Map();
	for (const item of dex.items.all()) {
		if (!item.exists) continue;
		if (!Number.isFinite(item.num) || item.num <= 0) continue;
		if (!itemNameByNo.has(item.num)) {
			itemNameByNo.set(item.num, item.name);
		}
	}
	return itemNameByNo;
}

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function getBalancedLevel(species) {
	const bst =
		species.baseStats.hp +
		species.baseStats.atk +
		species.baseStats.def +
		species.baseStats.spa +
		species.baseStats.spd +
		species.baseStats.spe;
	const level = Math.round(88 - (bst - 450) / 20);
	return clamp(level, 72, 90);
}

function getFallbackAbilities(species) {
	const abilities = [];
	for (const value of Object.values(species.abilities || {})) {
		if (value && !abilities.includes(value)) abilities.push(value);
	}
	return abilities.length ? abilities : ["No Ability"];
}

function getFallbackLevelUpMoveIds(species, trainerLevel, dex, learnsetsDiffs) {
	if (!species || !species.id) return [];
	const learnsetData =
		(learnsetsDiffs && learnsetsDiffs[species.id]) ||
		dex.species.getLearnsetData(species.id);
	const learnset = learnsetData && learnsetData.learnset;
	if (!learnset) return [];

	const maxLevel = Number(trainerLevel) || 100;
	const learnedAtLevel = [];

	for (const [moveId, sources] of Object.entries(learnset)) {
		if (!Array.isArray(sources) || !sources.length) continue;

		let bestLevel = -1;
		for (const source of sources) {
			if (typeof source !== "string") continue;
			const match = source.match(/^(?:\d+)L(\d+)$/);
			if (!match) continue;
			const sourceLevel = Number(match[1]);
			if (!Number.isFinite(sourceLevel) || sourceLevel > maxLevel) continue;
			if (sourceLevel > bestLevel) bestLevel = sourceLevel;
		}
		if (bestLevel < 0) continue;

		const move = dex.moves.get(moveId);
		if (!move.exists) continue;
		learnedAtLevel.push({
			id: move.id === "hail" ? "snowscape" : move.id,
			level: bestLevel,
		});
	}

	learnedAtLevel.sort((a, b) => {
		if (a.level !== b.level) return a.level - b.level;
		return a.id.localeCompare(b.id);
	});

	return learnedAtLevel.slice(-4).map(entry => entry.id);
}

function isDisallowedRandomBattleForm(species) {
	if (!species || !species.exists) return true;
	if (species.isMega || species.isPrimal) return true;
	if (species.isNonstandard === "Gigantamax") return true;
	if (String(species.id || "").includes("gmax")) return true;
	const forme = String(species.forme || "").toLowerCase();
	return (
		forme.includes("mega") ||
		forme.includes("primal") ||
		forme.includes("gmax") ||
		forme.includes("gigantamax")
	);
}

function isExcludedRelumiRandomBattleSpecies(species) {
	if (!species || !species.exists) return true;

	// Relumi has no tera mechanic in battle formats, so exclude all Ogerpon tera formes.
	if (species.baseSpecies === "Ogerpon" && String(species.id || "").endsWith("tera")) {
		return true;
	}

	return false;
}

function shouldSkipFallbackForSpecies(species) {
	if (!species || !species.exists) return true;

	// These species should only include sets for their base forme.
	if (
		FALLBACK_BASE_ONLY_SPECIES.has(species.baseSpecies.toLowerCase()) &&
		species.id !== toId(species.baseSpecies)
	) {
		return true;
	}

	return false;
}

function resolveTrainerSpeciesId(monsNo, formNo, speciesIdByMonsForm, dex) {
	const speciesOverrides = TRAINER_FORM_NUMBER_SPECIES_OVERRIDES[monsNo];
	if (speciesOverrides && speciesOverrides[formNo]) {
		const overrideSpecies = dex.species.get(speciesOverrides[formNo]);
		if (overrideSpecies.exists) return overrideSpecies.id;
		return null;
	}

	const exactSpeciesId = speciesIdByMonsForm.get(`${monsNo}_${formNo}`);
	if (exactSpeciesId) return exactSpeciesId;

	if (formNo > 0 && STRICT_TRAINER_FORM_SPECIES.has(monsNo)) {
		return null;
	}

	return speciesIdByMonsForm.get(`${monsNo}_0`) || null;
}

function inferSinglesRole(species, moveIds, dex) {
	let physical = 0;
	let special = 0;
	let status = 0;
	let hasRecovery = false;
	let hasSetup = false;
	let hasHazards = false;
	let hasSupport = false;

	for (const moveId of moveIds) {
		const move = dex.moves.get(moveId);
		if (!move.exists) continue;
		if (move.category === "Physical") physical++;
		if (move.category === "Special") special++;
		if (move.category === "Status") status++;
		if (RECOVERY_MOVES.has(move.id)) hasRecovery = true;
		if (SETUP_MOVES.has(move.id)) hasSetup = true;
		if (HAZARD_MOVES.has(move.id)) hasHazards = true;
		if (SINGLES_SUPPORT_MOVES.has(move.id)) hasSupport = true;
	}

	const offense = physical + special;
	if (hasSetup && species.baseStats.spe >= 90 && offense >= 2) {
		return "Setup Sweeper";
	}
	if (hasRecovery || hasHazards || hasSupport || status >= 2) {
		return "Bulky Support";
	}
	if (hasSetup) return "Bulky Setup";
	if (species.baseStats.spe >= 105 && offense >= 2) return "Fast Attacker";
	if (species.baseStats.spe >= 90 && offense >= 1) return "Fast Attacker";
	return "Bulky Attacker";
}

function inferDoublesRole(species, moveIds) {
	const hasSupportMove = moveIds.some(moveId =>
		DOUBLES_SUPPORT_MOVES.has(moveId)
	);
	if (hasSupportMove) return "Doubles Support";
	if (species.baseStats.spe <= 70) return "Doubles Wallbreaker";
	return "Bulky Attacker";
}

function rankDamagingMove(move) {
	if (!move || !move.exists) return -1;
	const basePower = Number(move.basePower || 0);
	const accuracy = move.accuracy === true ? 100 : Number(move.accuracy || 0);
	const priorityBonus = move.priority > 0 ? 10 : 0;
	return basePower + Math.floor(accuracy / 20) + priorityBonus;
}

function uniquePush(list, value) {
	if (!list.includes(value)) list.push(value);
}

function sortMovesByPower(moveIds, dex) {
	return moveIds
		.slice()
		.sort(
			(a, b) =>
				rankDamagingMove(dex.moves.get(b)) -
				rankDamagingMove(dex.moves.get(a))
		);
}

function pickBestMoves(moveIds, count, dex) {
	return sortMovesByPower(moveIds, dex).slice(0, count);
}

function computeMoveOverlapScore(a, b) {
	const aSet = new Set(a.moveIds);
	let overlap = 0;
	for (const moveId of b.moveIds) {
		if (aSet.has(moveId)) overlap++;
	}
	return overlap;
}

function chooseDiverseCandidates(candidates) {
	if (!candidates.length) return [];
	const sorted = candidates.slice().sort((a, b) => {
		if (a.trainerLevel !== b.trainerLevel)
			return b.trainerLevel - a.trainerLevel;
		if (a.moveIds.length !== b.moveIds.length)
			return b.moveIds.length - a.moveIds.length;
		return a.signature.localeCompare(b.signature);
	});

	const deduped = [];
	const seenSignatures = new Set();
	for (const candidate of sorted) {
		if (seenSignatures.has(candidate.signature)) continue;
		seenSignatures.add(candidate.signature);
		deduped.push(candidate);
	}

	const targetCount = Math.min(
		MAX_GENERATED_SETS_PER_SPECIES,
		Math.max(1, deduped.length >= 6 ? 3 : deduped.length >= 2 ? 2 : 1)
	);
	const chosen = [deduped[0]];

	while (chosen.length < targetCount) {
		let best = null;
		let bestScore = -1;
		for (const candidate of deduped) {
			if (chosen.includes(candidate)) continue;
			const overlapPenalty = chosen.reduce(
				(total, existing) =>
					total + computeMoveOverlapScore(existing, candidate),
				0
			);
			const score =
				candidate.trainerLevel * 10 +
				candidate.moveIds.length * 2 -
				overlapPenalty * 6;
			if (score > bestScore) {
				bestScore = score;
				best = candidate;
			}
		}
		if (!best) break;
		chosen.push(best);
	}

	return chosen;
}

function buildCandidate(
	species,
	moveIds,
	abilities,
	trainerLevel,
	dex,
	trainerSetData = null
) {
	const dedupedMoveIds = [];
	for (const moveId of moveIds) {
		if (!dedupedMoveIds.includes(moveId)) dedupedMoveIds.push(moveId);
	}
	const validMoveIds = [];
	for (const moveId of dedupedMoveIds) {
		const move = dex.moves.get(moveId);
		if (!move.exists) continue;
		validMoveIds.push(moveId);
	}
	const movepool = validMoveIds.map(moveId => dex.moves.get(moveId).name);
	const signature = `${validMoveIds.join("|")}::${abilities.join("|")}::${
		trainerSetData ? JSON.stringify(trainerSetData) : ""
	}`;
	return {
		trainerLevel,
		trainerSetData,
		moveIds: validMoveIds,
		movepool,
		abilities,
		teraTypes: species.types.slice(),
		signature,
		balancedLevel: getBalancedLevel(species),
		singlesRole: inferSinglesRole(species, validMoveIds, dex),
		doublesRole: inferDoublesRole(species, validMoveIds),
	};
}

function buildFallbackCandidates(species, learnsetEntry, dex) {
	if (!learnsetEntry || !learnsetEntry.learnset) return [];
	const allMoveIds = [];
	for (const moveId of Object.keys(learnsetEntry.learnset)) {
		const move = dex.moves.get(moveId);
		if (!move.exists) continue;
		allMoveIds.push(move.id);
	}
	if (allMoveIds.length < MIN_NON_DITTO_MOVES && species.id !== "ditto")
		return [];

	const damaging = [];
	const status = [];
	const stabDamaging = [];
	const coverageDamaging = [];
	for (const moveId of allMoveIds) {
		const move = dex.moves.get(moveId);
		if (move.category === "Status") {
			status.push(move.id);
			continue;
		}
		damaging.push(move.id);
		if (species.types.includes(move.type)) {
			stabDamaging.push(move.id);
		} else {
			coverageDamaging.push(move.id);
		}
	}

	if (!damaging.length && species.id !== "ditto") return [];

	const setupMoves = status.filter(moveId => SETUP_MOVES.has(moveId));
	const recoveryMoves = status.filter(moveId => RECOVERY_MOVES.has(moveId));
	const hazardMoves = status.filter(moveId => HAZARD_MOVES.has(moveId));
	const supportMoves = status.filter(
		moveId =>
			SINGLES_SUPPORT_MOVES.has(moveId) || DOUBLES_SUPPORT_MOVES.has(moveId)
	);

	const offenseMoves = [];
	for (const moveId of pickBestMoves(stabDamaging, 2, dex))
		uniquePush(offenseMoves, moveId);
	for (const moveId of pickBestMoves(coverageDamaging, 2, dex))
		uniquePush(offenseMoves, moveId);
	for (const moveId of pickBestMoves(damaging, 4, dex))
		uniquePush(offenseMoves, moveId);
	if (setupMoves.length) uniquePush(offenseMoves, setupMoves[0]);

	const supportSetMoves = [];
	for (const moveId of pickBestMoves(stabDamaging, 1, dex))
		uniquePush(supportSetMoves, moveId);
	for (const moveId of pickBestMoves(coverageDamaging, 1, dex))
		uniquePush(supportSetMoves, moveId);
	if (hazardMoves.length) uniquePush(supportSetMoves, hazardMoves[0]);
	if (recoveryMoves.length) uniquePush(supportSetMoves, recoveryMoves[0]);
	if (setupMoves.length) uniquePush(supportSetMoves, setupMoves[0]);
	if (supportMoves.length) uniquePush(supportSetMoves, supportMoves[0]);
	for (const moveId of status) {
		if (supportSetMoves.length >= 4) break;
		uniquePush(supportSetMoves, moveId);
	}
	for (const moveId of pickBestMoves(damaging, 4, dex)) {
		if (supportSetMoves.length >= 4) break;
		uniquePush(supportSetMoves, moveId);
	}

	const candidates = [];
	const abilities = getFallbackAbilities(species);
	const offenseSlice = offenseMoves.slice(0, 4);
	if (offenseSlice.length >= MIN_NON_DITTO_MOVES || species.id === "ditto") {
		candidates.push(buildCandidate(species, offenseSlice, abilities, 1, dex));
	}
	const supportSlice = supportSetMoves.slice(0, 4);
	if (
		supportSlice.length >= MIN_NON_DITTO_MOVES &&
		supportSlice.join("|") !== offenseSlice.join("|")
	) {
		candidates.push(buildCandidate(species, supportSlice, abilities, 1, dex));
	}

	return candidates;
}

function buildSetFromCandidate(candidate, isDoubles) {
	const set = {
		role: isDoubles ? candidate.doublesRole : candidate.singlesRole,
		movepool: candidate.movepool,
		abilities: candidate.abilities,
		teraTypes: candidate.teraTypes,
	};
	if (
		Number.isInteger(candidate.trainerId) &&
		candidate.trainerId > 0 &&
		candidate.trainerId <= MAX_TRAINER_ID
	) {
		set.trainerId = candidate.trainerId;
	}
	if (candidate.trainerSetData) {
		if (candidate.trainerSetData.item) {
			set.item = [candidate.trainerSetData.item];
		}
		if (candidate.trainerSetData.nature) {
			set.nature = [candidate.trainerSetData.nature];
		}
		if (candidate.trainerSetData.evs) {
			set.evs = candidate.trainerSetData.evs;
		}
	}
	return set;
}

function buildSetsObject(candidatesBySpecies, isDoubles) {
	const output = {};

	for (const [speciesId, candidates] of Array.from(
		candidatesBySpecies.entries()
	).sort(([a], [b]) => a.localeCompare(b))) {
		const chosen = chooseDiverseCandidates(candidates);
		if (!chosen.length) continue;

		output[speciesId] = {
			level: chosen[0].balancedLevel,
			sets: chosen.map(candidate =>
				buildSetFromCandidate(candidate, isDoubles)
			),
		};
	}

	return output;
}

function writeRelumiRandomBattleSetsFiles(
	singlesSets,
	doublesSets,
	singlesSetsPath,
	doublesSetsPath
) {
	fs.writeFileSync(
		singlesSetsPath,
		`${JSON.stringify(singlesSets, null, 4)}\n`,
		"utf8"
	);
	fs.writeFileSync(
		doublesSetsPath,
		`${JSON.stringify(doublesSets, null, 4)}\n`,
		"utf8"
	);
}

/** Build random battle JSON objects without writing (for tests / dry runs). */
function computeRelumiRandomBattleSets({
	trainerRows,
	abilityNames,
	moveNames,
	dex,
	speciesIdByMonsForm,
	mappedSpeciesIds,
	learnsetsDiffs,
}) {
	const candidatesBySpecies = new Map();
	const unmappedTrainerSpecies = new Set();
	const ignoredNfeSpecies = new Set();
	const unmappedTrainerItems = new Set();
	let fallbackSpeciesAdded = 0;
	let fallbackSetCount = 0;
	const itemNameByNo = buildItemNameByNo(dex);

	for (const trainer of trainerRows) {
		const trainerId = Number(trainer.ID || 0);
		if (trainerId > MAX_TRAINER_ID) continue;

		for (let slot = 1; slot <= 6; slot++) {
			const monsNo = Number(trainer[`P${slot}MonsNo`] || 0);
			if (!monsNo) continue;

			const formNo = Number(trainer[`P${slot}FormNo`] || 0);
			const speciesId = resolveTrainerSpeciesId(
				monsNo,
				formNo,
				speciesIdByMonsForm,
				dex
			);
			if (!speciesId) {
				unmappedTrainerSpecies.add(`${monsNo}_${formNo}`);
				continue;
			}

			const species = dex.species.get(speciesId);
			if (!species.exists) {
				unmappedTrainerSpecies.add(`${monsNo}_${formNo}`);
				continue;
			}
			if (isExcludedRelumiRandomBattleSpecies(species)) continue;
			if (shouldSkipFallbackForSpecies(species)) continue;
			if (isDisallowedRandomBattleForm(species)) continue;
			if (species.nfe) {
				ignoredNfeSpecies.add(species.id);
				continue;
			}

			const moveIds = [];
			const seenMoves = new Set();
			const trainerLevel = Number(trainer[`P${slot}Level`] || 1);
			for (let moveSlot = 1; moveSlot <= 4; moveSlot++) {
				const moveNo = Number(trainer[`P${slot}Waza${moveSlot}`] || 0);
				if (!moveNo) continue;
				const moveName = (moveNames.get(moveNo) || "").trim();
				if (!moveName || moveName === "\u2014\u2014\u2014") continue;
				const move = dex.moves.get(moveName);
				if (!move.exists) continue;
				const moveId = move.id === "hail" ? "snowscape" : move.id;
				if (seenMoves.has(moveId)) continue;
				seenMoves.add(moveId);
				moveIds.push(moveId);
			}
			if (!moveIds.length) {
				for (const moveId of getFallbackLevelUpMoveIds(
					species,
					trainerLevel,
					dex,
					learnsetsDiffs
				)) {
					if (seenMoves.has(moveId)) continue;
					seenMoves.add(moveId);
					moveIds.push(moveId);
				}
			}
			if (!moveIds.length) continue;
			if (species.id !== "ditto" && moveIds.length < MIN_NON_DITTO_MOVES)
				continue;

			const abilityNo = Number(trainer[`P${slot}Tokusei`] || 0);
			const abilityName = (abilityNames.get(abilityNo) || "").trim();
			let abilityList = getFallbackAbilities(species);
			if (abilityName) {
				const ability = dex.abilities.get(abilityName);
				if (ability.exists) abilityList = [ability.name];
			}

			const trainerSetData = {};

			const itemNo = Number(trainer[`P${slot}Item`] || 0);
			if (itemNo > 0) {
				const itemName = itemNameByNo.get(itemNo);
				if (itemName) {
					trainerSetData.item = itemName;
				} else {
					unmappedTrainerItems.add(String(itemNo));
				}
			}

			const natureNo = Number(trainer[`P${slot}Seikaku`] || 0);
			const natureName = NATURE_NAMES_BY_ID[natureNo];
			if (natureName) trainerSetData.nature = natureName;

			trainerSetData.evs = normalizeTrainerEvs(
				{
					hp: clampStatEv(trainer[`P${slot}EffortHp`]),
					atk: clampStatEv(trainer[`P${slot}EffortAtk`]),
					def: clampStatEv(trainer[`P${slot}EffortDef`]),
					spa: clampStatEv(trainer[`P${slot}EffortSpAtk`]),
					spd: clampStatEv(trainer[`P${slot}EffortSpDef`]),
					spe: clampStatEv(trainer[`P${slot}EffortAgi`]),
				},
				species
			);

			const candidate = buildCandidate(
				species,
				moveIds,
				abilityList,
				trainerLevel,
				dex,
				trainerSetData
			);
			if (trainerId > 0 && trainerId <= MAX_TRAINER_ID) {
				candidate.trainerId = trainerId;
			}

			if (!candidatesBySpecies.has(species.id)) {
				candidatesBySpecies.set(species.id, []);
			}
			candidatesBySpecies.get(species.id).push(candidate);
		}
	}

	for (const speciesId of mappedSpeciesIds || []) {
		if (candidatesBySpecies.has(speciesId)) continue;
		const species = dex.species.get(speciesId);
		if (
			!species.exists ||
			isExcludedRelumiRandomBattleSpecies(species) ||
			shouldSkipFallbackForSpecies(species) ||
			species.nfe ||
			isDisallowedRandomBattleForm(species)
		)
			continue;
		const fallbackCandidates = buildFallbackCandidates(
			species,
			learnsetsDiffs ? learnsetsDiffs[species.id] : null,
			dex
		);
		if (!fallbackCandidates.length) continue;
		candidatesBySpecies.set(species.id, fallbackCandidates);
		fallbackSpeciesAdded++;
		fallbackSetCount += fallbackCandidates.length;
	}

	const singlesSets = buildSetsObject(candidatesBySpecies, false);
	const doublesSets = buildSetsObject(candidatesBySpecies, true);

	return {
		singlesSets,
		doublesSets,
		singlesSpeciesCount: Object.keys(singlesSets).length,
		doublesSpeciesCount: Object.keys(doublesSets).length,
		totalSetCount: Object.values(singlesSets).reduce(
			(total, data) => total + (data.sets ? data.sets.length : 0),
			0
		),
		unmappedTrainerSpecies: Array.from(unmappedTrainerSpecies).sort(),
		unmappedTrainerItems: Array.from(unmappedTrainerItems)
			.map(n => Number(n))
			.sort((a, b) => a - b),
		ignoredNfeSpeciesCount: ignoredNfeSpecies.size,
		fallbackSpeciesAdded,
		fallbackSetCount,
	};
}

function buildRelumiRandomBattleSets({
	trainerRows,
	abilityNames,
	moveNames,
	dex,
	speciesIdByMonsForm,
	mappedSpeciesIds,
	learnsetsDiffs,
	singlesSetsPath,
	doublesSetsPath,
}) {
	const result = computeRelumiRandomBattleSets({
		trainerRows,
		abilityNames,
		moveNames,
		dex,
		speciesIdByMonsForm,
		mappedSpeciesIds,
		learnsetsDiffs,
	});
	writeRelumiRandomBattleSetsFiles(
		result.singlesSets,
		result.doublesSets,
		singlesSetsPath,
		doublesSetsPath
	);
	const { singlesSets, doublesSets, ...summary } = result;
	return summary;
}

module.exports = {
	buildRelumiRandomBattleSets,
	computeRelumiRandomBattleSets,
	writeRelumiRandomBattleSetsFiles,
};
