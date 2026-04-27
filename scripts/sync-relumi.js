#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { Dex, toID } = require("../dist/sim/dex");
const { buildMoveDiffs } = require("./sync-relumi-moves");
const { buildRelumiRandomBattleSets } = require("./sync-relumi-random-sets");

const ROOT = path.resolve(__dirname, "..");
const GAME_FILES_DIR = path.join(ROOT, "game-files");
const RELUMI_MOD_DIR = path.join(ROOT, "data", "mods", "gen8relumi");

const PATHS = {
	monsNames: path.join(GAME_FILES_DIR, "english_ss_monsname.json"),
	abilityNames: path.join(GAME_FILES_DIR, "english_ss_tokusei.json"),
	moveNames: path.join(GAME_FILES_DIR, "english_ss_wazaname.json"),
	formNames: path.join(GAME_FILES_DIR, "english_ss_zkn_form.json"),
	tamagoWazaTable: path.join(GAME_FILES_DIR, "TamagoWazaTable.json"),
	wazaOboeTable: path.join(GAME_FILES_DIR, "WazaOboeTable.json"),
	itemTable: path.join(GAME_FILES_DIR, "ItemTable.json"),
	tmLearnsetDir: path.join(GAME_FILES_DIR, "TMLearnset"),
	moveTutorLearnsetDir: path.join(GAME_FILES_DIR, "MoveTutorLearnset"),
	personalTable: path.join(GAME_FILES_DIR, "PersonalTable.json"),
	wazaTable: path.join(GAME_FILES_DIR, "WazaTable.json"),
	pokedexTs: path.join(RELUMI_MOD_DIR, "pokedex.ts"),
	movesTs: path.join(RELUMI_MOD_DIR, "moves.ts"),
	learnsetsTs: path.join(RELUMI_MOD_DIR, "learnsets.ts"),
	formatsDataTs: path.join(RELUMI_MOD_DIR, "formats-data.ts"),
	trainerTable: path.join(GAME_FILES_DIR, "TrainerTable.json"),
	relumiRandomSets: path.join(
		ROOT,
		"data",
		"random-battles",
		"gen8relumi",
		"sets.json"
	),
	relumiRandomDoublesSets: path.join(
		ROOT,
		"data",
		"random-battles",
		"gen8relumi",
		"doubles-sets.json"
	),
};

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

// Some species have game-file form indices that do not align with Showdown's
// formeOrder/otherFormes ordering. Keep these mappings explicit and strict.
const FORM_NUMBER_SPECIES_OVERRIDES = {
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
	774: {
		0: "Minior-Meteor",
		1: "Minior-Meteor",
		2: "Minior-Meteor",
		3: "Minior-Meteor",
		4: "Minior-Meteor",
		5: "Minior-Meteor",
		6: "Minior-Meteor",
		7: "Minior",
		8: "Minior-Orange",
		9: "Minior-Yellow",
		10: "Minior-Green",
		11: "Minior-Blue",
		12: "Minior-Indigo",
		13: "Minior-Violet",
	},
};

// These species have form entries in extracted game files that should stay
// cosmetic in Showdown. Map those rows to the base species instead of
// generating synthetic custom forms.
const CUSTOM_FORM_BASE_SPECIES_EXCEPTIONS = new Set([
	"unown",
	"sawsbuck",
	"florges",
	"alcremie",
	"furfrou",
	"vivillon",
]);

// Manual learnset overrides that must persist across sync runs.
// These are not always represented in extracted learnset tables.
const MANUAL_LEARNSET_OVERRIDES = {
	rotomheat: {
		overheat: ["8L1"],
	},
	rotomwash: {
		hydropump: ["8L1"],
	},
	rotomfrost: {
		blizzard: ["8L1"],
	},
	rotomfan: {
		airslash: ["8L1"],
	},
	rotommow: {
		leafstorm: ["8L1"],
	},
};

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getLabelString(entry) {
	if (!entry || !entry.wordDataArray || !entry.wordDataArray.length) return "";
	const firstWord = entry.wordDataArray[0];
	if (!firstWord || typeof firstWord.str !== "string") return "";
	return firstWord.str.trim().replace(/\u2019/g, "'"); // Avoid typographic apostrophes in labels since they often don't match Showdown's move/species names.
}

function extractIndexedNames(labelDataArray) {
	const map = new Map();
	for (const entry of labelDataArray) {
		if (!entry || typeof entry.arrayIndex !== "number") continue;
		map.set(entry.arrayIndex, getLabelString(entry));
	}
	return map;
}

function extractFormNames(labelDataArray) {
	const map = new Map();
	for (const entry of labelDataArray) {
		if (!entry || typeof entry.labelName !== "string") continue;
		const m = entry.labelName.match(/^ZKN_FORM_(\d{3,4})_(\d{3})$/);
		if (!m) continue;
		const monsNo = Number(m[1]);
		const formNo = Number(m[2]);
		map.set(`${monsNo}_${formNo}`, getLabelString(entry));
	}
	return map;
}

function decodeTmBitWords(words) {
	const bits = [];
	for (const value of words) {
		const n = Number(value) >>> 0;
		for (let bit = 0; bit < 32; bit++) {
			bits.push((n >>> bit) & 1);
		}
	}
	return bits;
}

function extractSetWordValues(tmData) {
	if (!tmData || typeof tmData !== "object") return [];
	const entries = Object.entries(tmData).filter(([key, value]) => {
		return /^set\d+$/i.test(key) && Number.isFinite(Number(value));
	});
	entries.sort((a, b) => {
		const aNum = Number(a[0].replace(/\D/g, "")) || 0;
		const bNum = Number(b[0].replace(/\D/g, "")) || 0;
		return aNum - bNum;
	});
	return entries.map(([, value]) => Number(value) >>> 0);
}

function parseMonFormFromFilename(fileName) {
	const match = fileName.match(/^monsno_(\d+)_formno_(\d+)\.json$/i);
	if (!match) return null;
	return { monsNo: Number(match[1]), formNo: Number(match[2]) };
}

function extractMachineMoveMap(itemJson) {
	const map = new Map();
	for (const entry of itemJson.WazaMachine || []) {
		if (!entry || typeof entry.machineNo !== "number") continue;
		if (!entry.wazaNo || entry.wazaNo <= 0) continue;
		map.set(entry.machineNo, entry.wazaNo);
	}
	return map;
}

function decodeTmMoves(tmJson, machineMoveMap) {
	const words = extractSetWordValues(tmJson);
	if (!words.length) return [];
	const bits = decodeTmBitWords(words);
	const moves = [];
	for (let index = 0; index < bits.length; index++) {
		if (!bits[index]) continue;
		const machineNo = index + 1;
		const moveNo = machineMoveMap.get(machineNo);
		if (!moveNo) continue;
		moves.push(moveNo);
	}
	return moves;
}

function mapWazaNoToMoveId(wazaNo, moveNames, dex, cache, unmappedMoves) {
	if (cache.has(wazaNo)) return cache.get(wazaNo);
	const moveName = (moveNames.get(wazaNo) || "").trim();
	if (!moveName || moveName === "\u2014\u2014\u2014") {
		cache.set(wazaNo, null);
		return null;
	}
	const move = dex.moves.get(moveName);
	if (!move.exists) {
		unmappedMoves.add(`${wazaNo}:${moveName}`);
		cache.set(wazaNo, null);
		return null;
	}
	const resolvedMoveId = move.id === "hail" ? "snowscape" : move.id;
	cache.set(wazaNo, resolvedMoveId);
	return resolvedMoveId;
}

function sortedUniqueNumbers(list) {
	const seen = new Set();
	const output = [];
	for (const value of list) {
		const n = Number(value);
		if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue;
		seen.add(n);
		output.push(n);
	}
	output.sort((a, b) => a - b);
	return output;
}

function sourceSort(a, b) {
	const sourceOrder = { L: 0, E: 1, M: 2, T: 3 };
	const aType = sourceOrder[a[1]] ?? 99;
	const bType = sourceOrder[b[1]] ?? 99;
	if (aType !== bType) return aType - bType;
	if (a[1] === "L" && b[1] === "L") {
		const aLevel = Number(a.slice(2)) || 0;
		const bLevel = Number(b.slice(2)) || 0;
		if (aLevel !== bLevel) return aLevel - bLevel;
	}
	return a.localeCompare(b);
}

function deepSort(value) {
	if (Array.isArray(value)) return value.map(deepSort);
	if (!value || typeof value !== "object") return value;
	const sorted = {};
	for (const key of Object.keys(value).sort()) {
		sorted[key] = deepSort(value[key]);
	}
	return sorted;
}

function formatTsKey(key) {
	if (/^[$A-Z_a-z][$0-9A-Z_a-z]*$/.test(key)) return key;
	return JSON.stringify(key);
}

function formatTsValue(value, indentLevel = 0) {
	if (Array.isArray(value)) {
		if (!value.length) return "[]";
		const indent = "\t".repeat(indentLevel);
		const childIndent = "\t".repeat(indentLevel + 1);
		const lines = value.map(
			(entry) => `${childIndent}${formatTsValue(entry, indentLevel + 1)},`,
		);
		return `[\n${lines.join("\n")}\n${indent}]`;
	}
	if (typeof value === "function") {
		const fnStr = value.toString();
		// Ensure function is output as a valid function expression (with 'function' keyword)
		// rather than method shorthand which may not parse correctly in object contexts
		if (!fnStr.startsWith("function") && !fnStr.startsWith("(")) {
			return `function ${fnStr}`;
		}
		return fnStr;
	}
	if (!value || typeof value !== "object") {
		return JSON.stringify(value);
	}
	const keys = Object.keys(value);
	if (!keys.length) return "{}";
	const indent = "\t".repeat(indentLevel);
	const childIndent = "\t".repeat(indentLevel + 1);
	const lines = keys.map(
		(key) =>
			`${childIndent}${formatTsKey(key)}: ${formatTsValue(value[key], indentLevel + 1)},`,
	);
	return `{\n${lines.join("\n")}\n${indent}}`;
}

function formatTsExport(exportName, importPath, typeName, value) {
	const sortedValue = deepSort(value);
	const body = formatTsValue(sortedValue);
	return `export const ${exportName}: import(${JSON.stringify(importPath)}).${typeName} = ${body};\n`;
}

function parseExportedObject(tsPath, exportName) {
	if (!fs.existsSync(tsPath)) return {};
	const source = fs.readFileSync(tsPath, "utf8");
	const exportRegex = new RegExp(
		`export\\s+const\\s+${exportName}\\s*:[^=]*=`,
		"m",
	);
	const match = source.match(exportRegex);
	if (!match) return {};
	const start = match.index + match[0].length;
	const tail = source.slice(start).trim();
	const semicolonIndex = tail.lastIndexOf(";");
	const objectExpression = (
		semicolonIndex >= 0 ? tail.slice(0, semicolonIndex) : tail
	).trim();
	if (!objectExpression) return {};
	try {
		return (
			vm.runInNewContext(`(${objectExpression})`, {}, { timeout: 1000 }) ||
			{}
		);
	} catch {
		return {};
	}
}

function normalizeForTokenization(str) {
	return str
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, " ")
		.replace(/[-_]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeFormForMatch(str) {
	return normalizeForTokenization(str || "")
		.replace(/\bgigantamax\b/g, "gmax")
		.replace(/\bmega\s+x\b/g, "megax")
		.replace(/\bmega\s+y\b/g, "megay")
		.replace(/\bforme?\b/g, "")
		.replace(/\bmode\b/g, "")
		.replace(/\bstyle\b/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function buildFormMatchVariants(label, baseSpeciesName) {
	const variants = new Set();
	const normalizedLabel = normalizeFormForMatch(label);
	if (normalizedLabel) variants.add(normalizedLabel);

	const baseTokens = normalizeForTokenization(baseSpeciesName || "")
		.split(" ")
		.filter(Boolean);
	if (!normalizedLabel || !baseTokens.length) return Array.from(variants);

	const labelTokens = normalizedLabel.split(" ").filter(Boolean);
	const stripped = labelTokens.filter((token) => !baseTokens.includes(token));
	if (stripped.length) variants.add(stripped.join(" "));

	return Array.from(variants);
}

function collectBaseFormCandidates(baseSpecies, dex) {
	const candidates = [];
	const seen = new Set();

	const tryPush = (speciesName) => {
		const species = dex.species.get(speciesName);
		if (!species.exists || seen.has(species.id)) return;
		if (species.baseSpecies !== baseSpecies.baseSpecies) return;
		seen.add(species.id);
		candidates.push(species);
	};

	tryPush(baseSpecies.name);

	if (Array.isArray(baseSpecies.formeOrder)) {
		for (const name of baseSpecies.formeOrder) tryPush(name);
	}
	if (Array.isArray(baseSpecies.otherFormes)) {
		for (const name of baseSpecies.otherFormes) tryPush(name);
	}

	// Gen 9 base formeOrder does not always list Past/nonstandard formes
	// (for example many Gmax formes). Include all matching base-species formes
	// so form-label mapping can target canonical existing IDs.
	for (const species of dex.species.all()) {
		if (species.baseSpecies !== baseSpecies.baseSpecies) continue;
		tryPush(species.name);
	}

	return candidates;
}

function findMappedSpeciesForForm(
	baseSpecies,
	monsNo,
	formNo,
	formLabel,
	types,
	baseStats,
	dex,
) {
	if (!baseSpecies.exists) return null;

	const speciesOverrides = FORM_NUMBER_SPECIES_OVERRIDES[monsNo];
	if (speciesOverrides && speciesOverrides[formNo]) {
		const overrideSpecies = dex.species.get(speciesOverrides[formNo]);
		if (overrideSpecies.exists) return overrideSpecies;
		// Strict mode: do not fall back to formeOrder for explicitly mapped forms.
		return null;
	}

	if (formNo === 0) return baseSpecies;

	if (
		Array.isArray(baseSpecies.formeOrder) &&
		baseSpecies.formeOrder[formNo]
	) {
		const byOrder = dex.species.get(baseSpecies.formeOrder[formNo]);
		if (byOrder.exists) return byOrder;
	}
	if (
		Array.isArray(baseSpecies.otherFormes) &&
		baseSpecies.otherFormes[formNo - 1]
	) {
		const byOther = dex.species.get(baseSpecies.otherFormes[formNo - 1]);
		if (byOther.exists) return byOther;
	}

	const labelVariants = buildFormMatchVariants(
		formLabel || "",
		baseSpecies.baseSpecies,
	);
	if (!labelVariants.length) return null;

	const baseId = toID(baseSpecies.baseSpecies);
	const candidates = collectBaseFormCandidates(baseSpecies, dex);
	for (const candidate of candidates) {
		const candidateTokens = new Set();
		const formeToken = normalizeFormForMatch(candidate.forme || "");
		if (formeToken) candidateTokens.add(formeToken);

		const nameSuffix = candidate.name.startsWith(
			`${baseSpecies.baseSpecies}-`,
		)
			? candidate.name.slice(baseSpecies.baseSpecies.length + 1)
			: candidate.name;
		const nameToken = normalizeFormForMatch(nameSuffix);
		if (nameToken) candidateTokens.add(nameToken);

		let idSuffix = candidate.id;
		if (idSuffix.startsWith(baseId)) idSuffix = idSuffix.slice(baseId.length);
		const idToken = normalizeFormForMatch(idSuffix);
		if (idToken) candidateTokens.add(idToken);

		// Sort tokens for order-independent matching (e.g., "gmax rapid strike" vs "rapid strike gmax")
		const sortTokens = (str) =>
			str.split(" ").filter(Boolean).sort().join(" ");

		for (const labelVariant of labelVariants) {
			const sortedLabelVariant = sortTokens(labelVariant);
			for (const token of candidateTokens) {
				if (sortedLabelVariant === sortTokens(token)) return candidate;
			}
		}
	}

	// Some extracted game tables omit form labels. If label mapping fails,
	// fall back to matching an existing forme by exact stats + typing.
	if (types && baseStats) {
		const byData = candidates.filter(
			(candidate) =>
				compareJson(candidate.types, types) &&
				compareJson(candidate.baseStats, baseStats),
		);
		if (byData.length === 1) return byData[0];
	}

	return null;
}

function buildFormeFromLabel(formLabel, baseName, formNo) {
	const normalizedLabel = normalizeForTokenization(formLabel || "");
	const normalizedBase = normalizeForTokenization(baseName || "");
	let tokens = normalizedLabel
		? normalizedLabel.split(" ").filter(Boolean)
		: [];
	const baseTokens = normalizedBase
		? normalizedBase.split(" ").filter(Boolean)
		: [];

	if (baseTokens.length && tokens.length >= baseTokens.length) {
		const startsWithBase = baseTokens.every(
			(token, index) => tokens[index] === token,
		);
		if (startsWithBase) tokens = tokens.slice(baseTokens.length);
	}

	const genericWords = new Set(["form", "forme", "mode", "style"]);
	const baseWords = new Set(baseTokens);
	tokens = tokens.filter(
		(token) => !genericWords.has(token) && !baseWords.has(token),
	);

	if (!tokens.length) return `Form ${formNo}`;

	const forme = tokens
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join(" ")
		.trim();

	return forme || `Form ${formNo}`;
}

function makeUniqueCustomFormId(
	baseId,
	forme,
	formNo,
	rowId,
	currentDiffs,
	dex,
) {
	const normalizedFormId = toID(forme);
	let candidate = normalizedFormId
		? `${baseId}${normalizedFormId}`
		: `${baseId}form${formNo}`;

	if (!candidate || candidate === baseId) {
		candidate = `${baseId}form${formNo}`;
	}

	if (dex.species.get(candidate).exists || currentDiffs[candidate]) {
		candidate = `${baseId}form${formNo}`;
	}

	if (
		dex.species.get(candidate).exists ||
		currentDiffs[candidate] ||
		candidate === baseId
	) {
		candidate = `${baseId}form${formNo}_${rowId}`;
	}

	return candidate;
}

function buildAbilitiesObject(row, abilityNames) {
	const ids = [row.tokusei1, row.tokusei2, row.tokusei3];
	const names = ids.map((id) =>
		typeof id === "number" ? (abilityNames.get(id) || "").trim() : "",
	);
	const clean = names.map((name) =>
		name.replace(/^[-\u2014\u2015\s]+$/, "").trim(),
	);
	const result = {};
	if (clean[0]) result["0"] = clean[0];
	if (clean[1] && clean[1] !== clean[0]) result["1"] = clean[1];
	if (clean[2] && clean[2] !== clean[0] && clean[2] !== clean[1])
		result.H = clean[2];
	return result;
}

function deriveFormNo(row) {
	if (row.id === row.monsno) return 0;
	if (row.form_max > 1 && row.id >= row.form_index) {
		const formNo = row.id - row.form_index + 1;
		if (formNo >= 1 && formNo <= row.form_max - 1) return formNo;
	}
	return 0;
}

function compareJson(a, b) {
	return JSON.stringify(deepSort(a)) === JSON.stringify(deepSort(b));
}

function diffSummary(prevObj, nextObj) {
	const prevKeys = new Set(Object.keys(prevObj || {}));
	const nextKeys = new Set(Object.keys(nextObj || {}));
	const added = [];
	const removed = [];
	const changed = [];

	for (const key of Array.from(nextKeys).sort()) {
		if (!prevKeys.has(key)) {
			added.push(key);
			continue;
		}
		if (!compareJson(prevObj[key], nextObj[key])) changed.push(key);
	}
	for (const key of Array.from(prevKeys).sort()) {
		if (!nextKeys.has(key)) removed.push(key);
	}
	return { added, changed, removed };
}

function buildSpeciesDiffs({
	monsNames,
	formNames,
	abilityNames,
	personalRows,
	dex,
}) {
	const pokedexDiffs = {};
	const customForms = [];
	const unmappedRows = [];
	const speciesIdByRowId = new Map();
	const speciesIdByMonsForm = new Map();
	// Keep a separate learnset mapping so cosmetic forms can validate moves
	// without forcing mechanics/stat diffs onto cosmetic IDs.
	const learnsetSpeciesIdByRowId = new Map();
	const learnsetSpeciesIdByMonsForm = new Map();
	// Track all species IDs that should receive Relumi tier tags in formats-data.
	const relumiTaggedSpeciesIds = new Set();

	for (const row of personalRows) {
		if (!row || row.valid_flag !== 1) continue;
		if (!row.monsno || row.monsno <= 0) continue;

		const baseName = (monsNames.get(row.monsno) || "").trim();
		if (!baseName) continue;

		const baseSpecies = dex.species.get(baseName);
		const formNo = deriveFormNo(row);
		const formLabel = (formNames.get(`${row.monsno}_${formNo}`) || "").trim();

		const type1 = TYPE_ID_TO_NAME[row.type1] || null;
		const type2Raw = TYPE_ID_TO_NAME[row.type2] || null;
		if (!type1) continue;
		const types =
			type2Raw && type2Raw !== type1 ? [type1, type2Raw] : [type1];

		const baseStats = {
			hp: row.basic_hp,
			atk: row.basic_atk,
			def: row.basic_def,
			spa: row.basic_spatk,
			spd: row.basic_spdef,
			spe: row.basic_agi,
		};

		const mappedSpecies = findMappedSpeciesForForm(
			baseSpecies,
			row.monsno,
			formNo,
			formLabel,
			types,
			baseStats,
			dex,
		);
		const mappedSpeciesIsCosmeticForm = !!(
			mappedSpecies &&
			mappedSpecies.exists &&
			mappedSpecies.isCosmeticForme &&
			toID(mappedSpecies.baseSpecies) === baseSpecies.id
		);
		const useBaseSpeciesForCosmeticForm =
			formNo > 0 &&
			baseSpecies.exists &&
			(
				mappedSpeciesIsCosmeticForm ||
				CUSTOM_FORM_BASE_SPECIES_EXCEPTIONS.has(baseSpecies.id)
			);
		let mappedOrBaseSpecies = null;
		if (useBaseSpeciesForCosmeticForm) {
			mappedOrBaseSpecies = baseSpecies;
		} else if (mappedSpecies && mappedSpecies.exists) {
			mappedOrBaseSpecies = mappedSpecies;
		}
		const abilitySet = buildAbilitiesObject(row, abilityNames);

		if (mappedOrBaseSpecies && mappedOrBaseSpecies.exists) {
			// Cosmetic forms should still map to their own learnsets even when
			// stats/types/abilities are inherited from the base species entry.
			const learnsetSpeciesId =
				mappedSpeciesIsCosmeticForm && mappedSpecies?.exists
					? mappedSpecies.id
					: mappedOrBaseSpecies.id;

			const statsDiff = !compareJson(
				mappedOrBaseSpecies.baseStats,
				baseStats,
			);
			const typesDiff = !compareJson(mappedOrBaseSpecies.types, types);
			const abilitiesDiff =
				Object.keys(abilitySet).length &&
				!compareJson(mappedOrBaseSpecies.abilities, abilitySet);

			speciesIdByRowId.set(row.id, mappedOrBaseSpecies.id);
			speciesIdByMonsForm.set(
				`${row.monsno}_${formNo}`,
				mappedOrBaseSpecies.id,
			);
			learnsetSpeciesIdByRowId.set(row.id, learnsetSpeciesId);
			learnsetSpeciesIdByMonsForm.set(
				`${row.monsno}_${formNo}`,
				learnsetSpeciesId,
			);
			relumiTaggedSpeciesIds.add(mappedOrBaseSpecies.id);
			if (mappedSpeciesIsCosmeticForm) {
				relumiTaggedSpeciesIds.add(mappedSpecies.id);
			}

			if (statsDiff || typesDiff || abilitiesDiff) {
				const entry = { inherit: true };
				if (statsDiff) entry.baseStats = baseStats;
				if (typesDiff) entry.types = types;
				if (abilitiesDiff) entry.abilities = abilitySet;
				pokedexDiffs[mappedOrBaseSpecies.id] = entry;
			}
			continue;
		}

		// Unmapped form/species: create a custom form entry when possible.
		if (baseSpecies.exists && formNo > 0) {
			const forme = buildFormeFromLabel(
				formLabel,
				baseSpecies.baseSpecies,
				formNo,
			);
			const customName = `${baseSpecies.baseSpecies}-${forme}`;
			const customId = makeUniqueCustomFormId(
				baseSpecies.id,
				forme,
				formNo,
				row.id,
				pokedexDiffs,
				dex,
			);
			const customEntry = {
				name: customName,
				num: baseSpecies.num,
				baseSpecies: baseSpecies.baseSpecies,
				forme,
				types,
				baseStats,
				abilities: buildAbilitiesObject(row, abilityNames),
				eggGroups: baseSpecies.eggGroups,
				heightm: Number((row.height / 100).toFixed(2)),
				weightkg: Number((row.weight / 10).toFixed(1)),
				gen: 8,
			};
			pokedexDiffs[customId] = customEntry;
			customForms.push(customId);
			speciesIdByRowId.set(row.id, customId);
			speciesIdByMonsForm.set(`${row.monsno}_${formNo}`, customId);
			learnsetSpeciesIdByRowId.set(row.id, customId);
			learnsetSpeciesIdByMonsForm.set(`${row.monsno}_${formNo}`, customId);
			relumiTaggedSpeciesIds.add(customId);
			continue;
		}

		unmappedRows.push({
			id: row.id,
			monsno: row.monsno,
			baseName,
			formNo,
			formLabel,
		});
	}

	return {
		pokedexDiffs,
		customForms,
		unmappedRows,
		speciesIdByRowId,
		speciesIdByMonsForm,
		learnsetSpeciesIdByRowId,
		learnsetSpeciesIdByMonsForm,
		mappedSpeciesIds: Array.from(
			new Set(speciesIdByMonsForm.values())
		).sort(),
		relumiTaggedSpeciesIds: Array.from(relumiTaggedSpeciesIds).sort(),
	};
}

function buildLearnsetsDiffs({
	personalRows,
	tamagoRows,
	wazaOboeRows,
	moveNames,
	dex,
	machineMoveMap,
	learnsetSpeciesIdByRowId,
	learnsetSpeciesIdByMonsForm,
	tmLearnsetDir,
	moveTutorLearnsetDir,
}) {
	const learnsetsDiffs = {};
	const speciesMoveSources = new Map();
	const moveIdCache = new Map();
	const unmappedMoveNumbers = new Set();
	const missingSpeciesRefs = new Set();

	function addSource(speciesId, moveId, source) {
		if (!speciesId || !moveId || !source) return;
		if (!speciesMoveSources.has(speciesId)) {
			speciesMoveSources.set(speciesId, new Map());
		}
		const moveMap = speciesMoveSources.get(speciesId);
		if (!moveMap.has(moveId)) moveMap.set(moveId, new Set());
		moveMap.get(moveId).add(source);
	}

	for (const entry of tamagoRows) {
		if (!entry || !entry.no || !Array.isArray(entry.wazaNo)) continue;
		const formNo = Number(entry.formNo || 0);
		// Learnsets are keyed by the learnset mapping, not the stats mapping,
		// so cosmetic forms get explicit learnset entries when needed.
		const speciesId = learnsetSpeciesIdByMonsForm.get(
			`${entry.no}_${formNo}`
		);
		if (!speciesId) {
			missingSpeciesRefs.add(`egg:${entry.no}_${formNo}`);
			continue;
		}
		for (const wazaNo of sortedUniqueNumbers(entry.wazaNo)) {
			const moveId = mapWazaNoToMoveId(
				wazaNo,
				moveNames,
				dex,
				moveIdCache,
				unmappedMoveNumbers
			);
			if (moveId) addSource(speciesId, moveId, "9E");
		}
	}

	for (const entry of wazaOboeRows) {
		if (!entry || typeof entry.id !== "number" || !Array.isArray(entry.ar)) {
			continue;
		}
		const speciesId = learnsetSpeciesIdByRowId.get(entry.id);
		if (!speciesId) {
			missingSpeciesRefs.add(`level:${entry.id}`);
			continue;
		}
		for (let i = 0; i + 1 < entry.ar.length; i += 2) {
			const level = Number(entry.ar[i]);
			const wazaNo = Number(entry.ar[i + 1]);
			if (!Number.isFinite(wazaNo) || wazaNo <= 0) continue;
			const moveId = mapWazaNoToMoveId(
				wazaNo,
				moveNames,
				dex,
				moveIdCache,
				unmappedMoveNumbers
			);
			if (!moveId) continue;
			const sourceLevel = Number.isFinite(level)
				? Math.max(1, Math.trunc(level))
				: 1;
			addSource(speciesId, moveId, `9L${sourceLevel}`);
		}
	}

	for (const fileName of fs.readdirSync(tmLearnsetDir)) {
		if (!fileName.endsWith(".json")) continue;
		const parsed = parseMonFormFromFilename(fileName);
		if (!parsed) continue;
		const speciesId = learnsetSpeciesIdByMonsForm.get(
			`${parsed.monsNo}_${parsed.formNo}`
		);
		if (!speciesId) {
			missingSpeciesRefs.add(`tm:${parsed.monsNo}_${parsed.formNo}`);
			continue;
		}
		const tmJson = readJson(path.join(tmLearnsetDir, fileName));
		const tmMoveNos = decodeTmMoves(tmJson, machineMoveMap);
		for (const wazaNo of sortedUniqueNumbers(tmMoveNos)) {
			const moveId = mapWazaNoToMoveId(
				wazaNo,
				moveNames,
				dex,
				moveIdCache,
				unmappedMoveNumbers
			);
			if (moveId) addSource(speciesId, moveId, "9M");
		}
	}

	for (const fileName of fs.readdirSync(moveTutorLearnsetDir)) {
		if (!fileName.endsWith(".json")) continue;
		const parsed = parseMonFormFromFilename(fileName);
		if (!parsed) continue;
		const speciesId = learnsetSpeciesIdByMonsForm.get(
			`${parsed.monsNo}_${parsed.formNo}`
		);
		if (!speciesId) {
			missingSpeciesRefs.add(`tutor:${parsed.monsNo}_${parsed.formNo}`);
			continue;
		}
		const tutorJson = readJson(path.join(moveTutorLearnsetDir, fileName));
		for (const wazaNo of sortedUniqueNumbers(tutorJson.moves || [])) {
			const moveId = mapWazaNoToMoveId(
				wazaNo,
				moveNames,
				dex,
				moveIdCache,
				unmappedMoveNumbers
			);
			if (moveId) addSource(speciesId, moveId, "9T");
		}
	}

	for (const [speciesId, learnset] of Object.entries(
		MANUAL_LEARNSET_OVERRIDES
	)) {
		for (const [moveId, sources] of Object.entries(learnset)) {
			for (const source of sources) {
				addSource(speciesId, moveId, source);
			}
		}
	}

	const speciesWithRows = new Set();
	for (const row of personalRows) {
		if (!row || row.valid_flag !== 1 || !row.monsno || row.monsno <= 0)
			continue;
		const formNo = deriveFormNo(row);
		const speciesId = learnsetSpeciesIdByMonsForm.get(
			`${row.monsno}_${formNo}`
		);
		if (speciesId) speciesWithRows.add(speciesId);
	}

	for (const speciesId of Object.keys(MANUAL_LEARNSET_OVERRIDES)) {
		speciesWithRows.add(speciesId);
	}

	for (const speciesId of Array.from(speciesWithRows).sort()) {
		const moveMap = speciesMoveSources.get(speciesId);
		if (!moveMap || !moveMap.size) continue;
		const learnset = {};
		for (const moveId of Array.from(moveMap.keys()).sort()) {
			learnset[moveId] = Array.from(moveMap.get(moveId)).sort(sourceSort);
		}
		learnsetsDiffs[speciesId] = { learnset };
	}

	return {
		learnsetsDiffs,
		unmappedMoveNumbers: Array.from(unmappedMoveNumbers).sort(),
		missingSpeciesRefs: Array.from(missingSpeciesRefs).sort(),
	};
}

function buildFormatsDataDiffs({ mappedSpeciesIds, dex }) {
	const formatsDataDiffs = {};
	const mappedBaseSpeciesIds = new Set();
	const taggedSpeciesIds = new Set();

	function addRelumiTag(speciesId) {
		if (!speciesId || taggedSpeciesIds.has(speciesId)) return;
		taggedSpeciesIds.add(speciesId);
		formatsDataDiffs[speciesId] = {
			tier: "Relumi",
			doublesTier: "Relumi",
		};
	}

	for (const speciesId of mappedSpeciesIds) {
		const species = dex.species.get(speciesId);
		if (species.exists) {
			mappedBaseSpeciesIds.add(toID(species.baseSpecies || species.name));
			const baseSpecies = dex.species.get(
				species.baseSpecies || species.name,
			);
			// Ensure exception species keep all cosmetic/alternate formes tagged
			// even when extracted rows only touched a subset of their formes.
			if (
				baseSpecies.exists &&
				CUSTOM_FORM_BASE_SPECIES_EXCEPTIONS.has(baseSpecies.id)
			) {
				for (const formeName of [
					...(baseSpecies.cosmeticFormes || []),
					...(baseSpecies.otherFormes || []),
				]) {
					const forme = dex.species.get(formeName);
					if (forme.exists) addRelumiTag(forme.id);
				}
			}
		}
		addRelumiTag(speciesId);
	}

	for (const species of dex.species.all()) {
		if (!species.exists || !species.id.endsWith("gmax")) continue;
		const baseId = toID(species.baseSpecies || species.name);
		if (!mappedBaseSpeciesIds.has(baseId)) continue;
		addRelumiTag(species.id);
	}

	return formatsDataDiffs;
}

function ensureGameFilesExist() {
	for (const filePath of Object.values(PATHS)) {
		if (!filePath.startsWith(GAME_FILES_DIR)) continue;
		if (!fs.existsSync(filePath)) {
			throw new Error(
				`Missing required game file: ${path.relative(ROOT, filePath)}`,
			);
		}
	}
}

function main() {
	ensureGameFilesExist();

	const monsJson = readJson(PATHS.monsNames);
	const abilityJson = readJson(PATHS.abilityNames);
	const moveJson = readJson(PATHS.moveNames);
	const formJson = readJson(PATHS.formNames);
	const tamagoJson = readJson(PATHS.tamagoWazaTable);
	const wazaOboeJson = readJson(PATHS.wazaOboeTable);
	const itemJson = readJson(PATHS.itemTable);
	const personalJson = readJson(PATHS.personalTable);
	const wazaJson = readJson(PATHS.wazaTable);
	const trainerJson = readJson(PATHS.trainerTable);

	const monsNames = extractIndexedNames(monsJson.labelDataArray || []);
	const abilityNames = extractIndexedNames(abilityJson.labelDataArray || []);
	const moveNames = extractIndexedNames(moveJson.labelDataArray || []);
	const formNames = extractFormNames(formJson.labelDataArray || []);
	const tamagoRows = tamagoJson.Data || [];
	const wazaOboeRows = wazaOboeJson.WazaOboe || [];
	const machineMoveMap = extractMachineMoveMap(itemJson);
	const personalRows = personalJson.Personal || [];
	const wazaRows = wazaJson.Waza || [];
	const trainerRows = trainerJson.TrainerPoke || [];

	const dex = Dex.mod("gen8");

	const previousPokedex = parseExportedObject(PATHS.pokedexTs, "Pokedex");
	const previousMoves = parseExportedObject(PATHS.movesTs, "Moves");
	const previousLearnsets = parseExportedObject(
		PATHS.learnsetsTs,
		"Learnsets",
	);
	const previousFormatsData = parseExportedObject(
		PATHS.formatsDataTs,
		"FormatsData",
	);

	const {
		pokedexDiffs,
		customForms,
		unmappedRows,
		speciesIdByRowId,
		speciesIdByMonsForm,
		learnsetSpeciesIdByRowId,
		learnsetSpeciesIdByMonsForm,
		mappedSpeciesIds,
		relumiTaggedSpeciesIds,
	} = buildSpeciesDiffs({
		monsNames,
		formNames,
		abilityNames,
		personalRows,
		dex,
	});
	const { movesDiffs, unmappedMoves } = buildMoveDiffs({
		moveNames,
		wazaRows,
		dex,
	});
	const { learnsetsDiffs, unmappedMoveNumbers, missingSpeciesRefs } =
		buildLearnsetsDiffs({
			personalRows,
			tamagoRows,
			wazaOboeRows,
			moveNames,
			dex,
			machineMoveMap,
			learnsetSpeciesIdByRowId,
			learnsetSpeciesIdByMonsForm,
			tmLearnsetDir: PATHS.tmLearnsetDir,
			moveTutorLearnsetDir: PATHS.moveTutorLearnsetDir,
		});
	// Use the tagged species set so cosmetic forms remain visible as Relumi
	// in teambuilder/search even when their mechanics map to base species.
	const formatsDataDiffs = buildFormatsDataDiffs({
		mappedSpeciesIds: relumiTaggedSpeciesIds,
		dex,
	});

	const nextPokedex = deepSort(pokedexDiffs);
	const nextMoves = deepSort(movesDiffs);
	const nextLearnsets = deepSort(learnsetsDiffs);
	const nextFormatsData = deepSort(formatsDataDiffs);

	const pokedexText = formatTsExport(
		"Pokedex",
		"../../../sim/dex-species",
		"ModdedSpeciesDataTable",
		nextPokedex,
	);
	const movesText = formatTsExport(
		"Moves",
		"../../../sim/dex-moves",
		"ModdedMoveDataTable",
		nextMoves,
	);
	const learnsetsText = formatTsExport(
		"Learnsets",
		"../../../sim/dex-species",
		"ModdedLearnsetDataTable",
		nextLearnsets,
	);
	const formatsDataText = formatTsExport(
		"FormatsData",
		"../../../sim/dex-species",
		"ModdedSpeciesFormatsDataTable",
		nextFormatsData,
	);
	const randomSetSummary = buildRelumiRandomBattleSets({
		trainerRows,
		abilityNames,
		moveNames,
		dex,
		speciesIdByMonsForm,
		mappedSpeciesIds,
		learnsetsDiffs,
		singlesSetsPath: PATHS.relumiRandomSets,
		doublesSetsPath: PATHS.relumiRandomDoublesSets,
	});

	fs.writeFileSync(PATHS.pokedexTs, pokedexText, "utf8");
	fs.writeFileSync(PATHS.movesTs, movesText, "utf8");
	fs.writeFileSync(PATHS.learnsetsTs, learnsetsText, "utf8");
	fs.writeFileSync(PATHS.formatsDataTs, formatsDataText, "utf8");

	const pokedexDiff = diffSummary(previousPokedex, nextPokedex);
	const movesDiff = diffSummary(previousMoves, nextMoves);
	const learnsetsDiff = diffSummary(previousLearnsets, nextLearnsets);
	const formatsDataDiff = diffSummary(previousFormatsData, nextFormatsData);

	console.log("Relumi sync completed.");
	console.log("");
	console.log("Files regenerated:");
	console.log(`- ${path.relative(ROOT, PATHS.pokedexTs)}`);
	console.log(`- ${path.relative(ROOT, PATHS.movesTs)}`);
	console.log(`- ${path.relative(ROOT, PATHS.learnsetsTs)}`);
	console.log(`- ${path.relative(ROOT, PATHS.formatsDataTs)}`);
	console.log(`- ${path.relative(ROOT, PATHS.relumiRandomSets)}`);
	console.log(`- ${path.relative(ROOT, PATHS.relumiRandomDoublesSets)}`);
	console.log("");
	console.log("Pokedex diff summary:");
	console.log(`- Added: ${pokedexDiff.added.length}`);
	console.log(`- Changed: ${pokedexDiff.changed.length}`);
	console.log(`- Removed: ${pokedexDiff.removed.length}`);
	if (pokedexDiff.added.length)
		console.log(`  added keys: ${pokedexDiff.added.join(", ")}`);
	if (pokedexDiff.changed.length)
		console.log(`  changed keys: ${pokedexDiff.changed.join(", ")}`);
	if (pokedexDiff.removed.length)
		console.log(`  removed keys: ${pokedexDiff.removed.join(", ")}`);
	console.log("");
	console.log("Moves diff summary:");
	console.log(`- Added: ${movesDiff.added.length}`);
	console.log(`- Changed: ${movesDiff.changed.length}`);
	console.log(`- Removed: ${movesDiff.removed.length}`);
	if (movesDiff.added.length)
		console.log(`  added keys: ${movesDiff.added.join(", ")}`);
	if (movesDiff.changed.length)
		console.log(`  changed keys: ${movesDiff.changed.join(", ")}`);
	if (movesDiff.removed.length)
		console.log(`  removed keys: ${movesDiff.removed.join(", ")}`);
	console.log("");
	console.log("Learnsets diff summary:");
	console.log(`- Added: ${learnsetsDiff.added.length}`);
	console.log(`- Changed: ${learnsetsDiff.changed.length}`);
	console.log(`- Removed: ${learnsetsDiff.removed.length}`);
	if (learnsetsDiff.added.length)
		console.log(`  added keys: ${learnsetsDiff.added.join(", ")}`);
	if (learnsetsDiff.changed.length)
		console.log(`  changed keys: ${learnsetsDiff.changed.join(", ")}`);
	if (learnsetsDiff.removed.length)
		console.log(`  removed keys: ${learnsetsDiff.removed.join(", ")}`);
	console.log("");
	console.log("FormatsData diff summary:");
	console.log(`- Added: ${formatsDataDiff.added.length}`);
	console.log(`- Changed: ${formatsDataDiff.changed.length}`);
	console.log(`- Removed: ${formatsDataDiff.removed.length}`);
	if (formatsDataDiff.added.length)
		console.log(`  added keys: ${formatsDataDiff.added.join(", ")}`);
	if (formatsDataDiff.changed.length)
		console.log(`  changed keys: ${formatsDataDiff.changed.join(", ")}`);
	if (formatsDataDiff.removed.length)
		console.log(`  removed keys: ${formatsDataDiff.removed.join(", ")}`);
	console.log("");
	console.log(`Custom forms generated: ${customForms.length}`);
	if (customForms.length) console.log(`- ${customForms.join(", ")}`);
	console.log(`Unmapped personal rows: ${unmappedRows.length}`);
	if (unmappedRows.length) {
		const preview = unmappedRows
			.slice(0, 20)
			.map((r) => `${r.id}:${r.baseName}#${r.formNo}`);
		console.log(`- sample: ${preview.join(", ")}`);
	}
	console.log(`Unmapped moves: ${unmappedMoves.length}`);
	if (unmappedMoves.length) {
		const preview = unmappedMoves
			.slice(0, 20)
			.map((r) => `${r.wazaNo}:${r.moveName}`);
		console.log(`- sample: ${preview.join(", ")}`);
	}
	console.log(`Unmapped learnset moves: ${unmappedMoveNumbers.length}`);
	if (unmappedMoveNumbers.length) {
		console.log(`- sample: ${unmappedMoveNumbers.slice(0, 20).join(", ")}`);
	}
	console.log(`Missing learnset species refs: ${missingSpeciesRefs.length}`);
	if (missingSpeciesRefs.length) {
		console.log(`- sample: ${missingSpeciesRefs.slice(0, 20).join(", ")}`);
	}
	console.log("Random battle sets summary:");
	console.log(`- Singles species: ${randomSetSummary.singlesSpeciesCount}`);
	console.log(`- Doubles species: ${randomSetSummary.doublesSpeciesCount}`);
	console.log(`- Total generated sets: ${randomSetSummary.totalSetCount}`);
	console.log(
		`- Ignored NFE species: ${randomSetSummary.ignoredNfeSpeciesCount}`,
	);
	console.log(
		`- Unmapped trainer species refs: ${randomSetSummary.unmappedTrainerSpecies.length}`,
	);
	console.log(
		`- Unmapped trainer item IDs: ${(randomSetSummary.unmappedTrainerItems || []).length}`,
	);
	console.log(
		`- Fallback species added: ${randomSetSummary.fallbackSpeciesAdded}`,
	);
	console.log(
		`- Fallback sets generated: ${randomSetSummary.fallbackSetCount}`,
	);
	if (randomSetSummary.unmappedTrainerSpecies.length) {
		console.log(
			`- sample: ${randomSetSummary.unmappedTrainerSpecies
				.slice(0, 20)
				.join(", ")}`,
		);
	}
	if (randomSetSummary.unmappedTrainerItems?.length) {
		console.log(
			`- unmapped item sample: ${randomSetSummary.unmappedTrainerItems
				.slice(0, 20)
				.join(", ")}`,
		);
	}
}

main();
