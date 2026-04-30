#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const { getRelumiRepoRoot } = require("./lib/relumi-paths");
const { deepSort } = require("./lib/relumi-deep-sort");
const { parseExportedObject } = require("./lib/relumi-parse-exported-object");

const ROOT = getRelumiRepoRoot();
const SERVER_MOD_DIR = path.join(ROOT, "data", "mods", "gen8relumi");
const FORMATS_PATH = path.join(ROOT, "config", "formats.ts");
const CLIENT_ROOT_CANDIDATES = [
	path.join(ROOT, "..", "pokemon-showdown-client"),
	path.join(ROOT, "pokemon-showdown-client"),
];
const CLIENT_ROOT =
	CLIENT_ROOT_CANDIDATES.find(candidate => fs.existsSync(candidate)) ||
	CLIENT_ROOT_CANDIDATES[0];
const CLIENT_REL_PATH = path.join(
	"play.pokemonshowdown.com",
	"data",
	"relumi-overrides.js"
);
const CLIENT_OUT_PATH = path.join(CLIENT_ROOT, CLIENT_REL_PATH);
const CLIENT_LOG_PATH = path.join(
	path.basename(CLIENT_ROOT),
	"play.pokemonshowdown.com",
	"data",
	"relumi-overrides.js"
);
const ABILITIES_TEXT_PATH = path.join(ROOT, "data", "text", "abilities.ts");
const MOVES_TEXT_PATH = path.join(ROOT, "data", "text", "moves.ts");
const RELUMI_ABILITIES_TEXT_PATH = path.join(SERVER_MOD_DIR, "text", "abilities.ts");
const RELUMI_GEN9_SNOW_ABILITY_IDS = [
	"snowcloak",
	"icebody",
	"iceface",
	"slushrush",
	"snowwarning",
];
const RELUMI_GEN9_SNOW_MOVE_IDS = [
	"auroraveil",
	"blizzard",
];
const RELUMI_BAN_CONSTANTS = {
	base: "RELUMI_BASE_BANLIST",
	gen9Allowlist: "RELUMI_GEN9_UNBANLIST",
	ou: "RELUMI_OU_BANLIST",
};

/** Shared name/shortDesc/desc extraction for abilities and moves text tables. */
function pickBattleTextFields(entry) {
	if (!entry || typeof entry !== "object") return null;
	const override = {};
	if (typeof entry.name === "string" && entry.name) override.name = entry.name;
	if (typeof entry.shortDesc === "string" && entry.shortDesc) {
		override.shortDesc = entry.shortDesc;
	}
	if (typeof entry.desc === "string" && entry.desc) override.desc = entry.desc;
	return Object.keys(override).length ? override : null;
}

function stripInheritAndEmpty(entry) {
	if (!entry || typeof entry !== "object") return entry;
	const out = {};
	for (const [key, value] of Object.entries(entry)) {
		if (key === "inherit") continue;
		if (value === undefined) continue;
		out[key] = value;
	}
	return out;
}

function buildOverrideMap(table) {
	const out = {};
	for (const [id, entry] of Object.entries(table || {})) {
		const cleaned = stripInheritAndEmpty(entry);
		if (Object.keys(cleaned).length) out[id] = cleaned;
	}
	return deepSort(out);
}

function buildTeambuilderLearnsets(table) {
	const out = {};
	for (const [speciesId, speciesEntry] of Object.entries(table || {})) {
		if (!speciesEntry || typeof speciesEntry !== "object") continue;
		const sourceLearnset = speciesEntry.learnset;
		if (!sourceLearnset || typeof sourceLearnset !== "object") continue;

		const learnset = {};
		for (const [moveId, rawSources] of Object.entries(sourceLearnset)) {
			if (Array.isArray(rawSources)) {
				learnset[moveId] = rawSources
					.map((source) => String(source).toLowerCase())
					.join(",");
			} else if (typeof rawSources === "string") {
				learnset[moveId] = rawSources.toLowerCase();
			}
		}

		if (Object.keys(learnset).length) out[speciesId] = learnset;
	}
	return deepSort(out);
}

function buildTierOverrides(table) {
	const out = {};
	for (const [speciesId, entry] of Object.entries(table || {})) {
		if (!entry || typeof entry !== "object") continue;
		if (typeof entry.tier !== "string" || !entry.tier) continue;
		out[speciesId] = entry.tier;
	}
	return deepSort(out);
}

function buildAbilityTextOverrides(textTable, ids) {
	const out = {};
	for (const id of ids) {
		const picked = pickBattleTextFields(textTable?.[id]);
		if (picked) out[id] = picked;
	}
	return deepSort(out);
}

function buildRelumiAbilityTextOverrides(relumiTextTable) {
	const out = {};
	for (const [id, entry] of Object.entries(relumiTextTable || {})) {
		const picked = pickBattleTextFields(entry);
		if (picked) out[id] = picked;
	}
	return deepSort(out);
}

function buildMoveTextOverrides(textTable, ids) {
	const out = {};
	for (const id of ids) {
		const picked = pickBattleTextFields(textTable?.[id]);
		if (picked) out[id] = picked;
	}
	return deepSort(out);
}

function toID(text) {
	return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseConstStringArray(tsPath, constName) {
	if (!fs.existsSync(tsPath)) return [];
	const source = fs.readFileSync(tsPath, "utf8");
	const arrayRegex = new RegExp(
		`const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s+const\\s*;`,
		"m"
	);
	const match = source.match(arrayRegex);
	if (!match) return [];

	const values = [];
	const stringRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g;
	for (const stringMatch of match[1].matchAll(stringRegex)) {
		const raw = stringMatch[1] ?? stringMatch[2] ?? "";
		values.push(raw.replace(/\\(["'\\bnrtvf])/g, "$1"));
	}
	return values;
}

/**
 * Collect custom form species IDs from speciesOverrides.
 * A "custom form" is any entry that has both baseSpecies and forme,
 * where the entry's ID is not the same as toID(baseSpecies).
 * These are the forms that need BattlePokemonSprites + BattlePokemonIconIndexes entries.
 */
function buildRelumiSpriteData(speciesOverrides) {
	// Gather all custom form IDs, sorted by Pokédex number (then ID) for stable slot assignment.
	const customFormIds = Object.keys(speciesOverrides)
		.filter(sid => {
			const data = speciesOverrides[sid];
			return (
				data &&
				typeof data.baseSpecies === "string" &&
				data.baseSpecies &&
				typeof data.forme === "string" &&
				data.forme &&
				toID(data.baseSpecies) !== sid
			);
		})
		.sort((a, b) => {
			const numA = speciesOverrides[a].num ?? Infinity;
			const numB = speciesOverrides[b].num ?? Infinity;
			return numA !== numB ? numA - numB : a < b ? -1 : a > b ? 1 : 0;
		});

	// Assign icon sheet slots starting after the last upstream slot (1560+80=1640).
	// Sorted order ensures the same form always gets the same slot across re-runs.
	const RELUMI_ICON_BASE = 1641;
	const iconIndexes = {};
	customFormIds.forEach((sid, i) => {
		iconIndexes[sid] = RELUMI_ICON_BASE + i;
	});

	// Build BattlePokemonSprites entries so the battle scene can find the GIF.
	// We use 96x96 as the default dimensions; actual GIF files in sprites/ani/
	// will be used at whatever size they are — the dimensions here only affect
	// the initial layout box, not the rendered image.
	const spriteEntries = {};
	customFormIds.forEach(sid => {
		const data = speciesOverrides[sid];
		spriteEntries[sid] = {
			num: data.num,
			front: { w: 96, h: 96 },
			back: { w: 96, h: 96 },
		};
	});

	return { iconIndexes, spriteEntries, customFormIds };
}

function buildRelumiBanConfig(formatsPath) {
	const baseBanlist = parseConstStringArray(formatsPath, RELUMI_BAN_CONSTANTS.base);
	const gen9Allowlist = parseConstStringArray(
		formatsPath,
		RELUMI_BAN_CONSTANTS.gen9Allowlist
	);
	const ouBanlist = parseConstStringArray(formatsPath, RELUMI_BAN_CONSTANTS.ou);

	const baseTagBans = baseBanlist.filter((entry) => entry.startsWith("pokemontag:"));
	const basePokemonBans = baseBanlist
		.filter((entry) => !entry.startsWith("pokemontag:"))
		.map((entry) => toID(entry));

	return deepSort({
		baseTagBans,
		basePokemonBans,
		gen9Allowlist: gen9Allowlist.map((entry) => toID(entry)),
		ouPokemonBans: ouBanlist.map((entry) => toID(entry)),
	});
}

function main() {
	const pokedex = parseExportedObject(
		path.join(SERVER_MOD_DIR, "pokedex.ts"),
		"Pokedex"
	);
	const moves = parseExportedObject(
		path.join(SERVER_MOD_DIR, "moves.ts"),
		"Moves"
	);
	const learnsets = parseExportedObject(
		path.join(SERVER_MOD_DIR, "learnsets.ts"),
		"Learnsets"
	);
	const formatsData = parseExportedObject(
		path.join(SERVER_MOD_DIR, "formats-data.ts"),
		"FormatsData"
	);
	const abilitiesText = parseExportedObject(ABILITIES_TEXT_PATH, "AbilitiesText");
	const movesText = parseExportedObject(MOVES_TEXT_PATH, "MovesText");
	const relumiAbilitiesText = parseExportedObject(RELUMI_ABILITIES_TEXT_PATH, "AbilitiesText");

	const speciesOverrides = buildOverrideMap(pokedex);
	const moveOverrides = buildOverrideMap(moves);
	const relumiLearnsets = buildTeambuilderLearnsets(learnsets);
	const tierOverrides = buildTierOverrides(formatsData);
	const snowAbilityOverrides = buildAbilityTextOverrides(
		abilitiesText,
		RELUMI_GEN9_SNOW_ABILITY_IDS
	);
	const relumiAbilityOverrides = buildRelumiAbilityTextOverrides(relumiAbilitiesText);
	const abilityOverrides = { ...snowAbilityOverrides, ...relumiAbilityOverrides };
	const moveTextOverrides = buildMoveTextOverrides(
		movesText,
		RELUMI_GEN9_SNOW_MOVE_IDS
	);
	const relumiBanConfig = buildRelumiBanConfig(FORMATS_PATH);
	const { iconIndexes, spriteEntries } = buildRelumiSpriteData(speciesOverrides);

	// Precompute gen 8 shortDesc for moves/abilities so the client compares
	// against the correct baseline (gen 8, not gen 9).
	const gen8MoveDescs = {};
	for (const id of [...Object.keys(moveOverrides), ...RELUMI_GEN9_SNOW_MOVE_IDS]) {
		const entry = movesText[id];
		if (!entry) continue;
		const g8 = entry.gen8;
		gen8MoveDescs[id] = (g8 && typeof g8.shortDesc === 'string') ? g8.shortDesc : (entry.shortDesc || '');
	}
	const gen8AbilityDescs = {};
	for (const id of Object.keys(abilityOverrides)) {
		const entry = abilitiesText[id];
		if (!entry) continue;
		const g8 = entry.gen8;
		gen8AbilityDescs[id] = (g8 && typeof g8.shortDesc === 'string') ? g8.shortDesc : (entry.shortDesc || '');
	}

	const text =
		`// DO NOT EDIT - generated by scripts/export-relumi-client-overrides.js\n\n` +
		`(function () {\n` +
		`\tfunction toID(text) {\n` +
		`\t\treturn ("" + text).toLowerCase().replace(/[^a-z0-9]+/g, "");\n` +
		`\t}\n` +
		`\tfunction pushUnique(list, value) {\n` +
		`\t\tif (!Array.isArray(list)) return [value];\n` +
		`\t\tif (!list.includes(value)) list.push(value);\n` +
		`\t\treturn list;\n` +
		`\t}\n` +
		`\tfunction shouldExposeCustomForme(speciesData, speciesId) {\n` +
		`\t\tif (!speciesData || typeof speciesData !== "object") return false;\n` +
		`\t\tif (!speciesData.baseSpecies || !speciesData.forme) return false;\n` +
		`\t\tif (speciesData.cosmeticFormes || speciesData.baseForme) return false;\n` +
		`\t\tif (speciesData.battleOnly || speciesData.isNonstandard) return false;\n` +
		`\t\treturn toID(speciesData.baseSpecies) !== speciesId;\n` +
		`\t}\n` +
		`\tvar speciesOverrides = ${JSON.stringify(speciesOverrides)};\n` +
		`\tvar moveOverrides = ${JSON.stringify(moveOverrides)};\n` +
		`\tvar gen8MoveDescs = ${JSON.stringify(gen8MoveDescs)};\n` +
		`\tvar gen8AbilityDescs = ${JSON.stringify(gen8AbilityDescs)};\n` +
		`\tvar vanillaSpeciesData = {};\n` +
		`\tvar vanillaMoveData = {};\n` +
		`\tvar vanillaAbilityData = {};\n` +
		`\tvar relumiIconIndexes = ${JSON.stringify(iconIndexes)};\n` +
		`\tvar relumiSpriteEntries = ${JSON.stringify(spriteEntries)};\n` +
		`\tif (typeof exports !== "undefined") {\n` +
		`\t\tif (exports.BattlePokedex) {\n` +
		`\t\t\tfor (var vanillaSid in speciesOverrides) {\n` +
		`\t\t\t\tvar vanillaSpecies = exports.BattlePokedex[vanillaSid];\n` +
		`\t\t\t\tif (!vanillaSpecies) continue;\n` +
		`\t\t\t\tvanillaSpeciesData[vanillaSid] = {\n` +
		`\t\t\t\t\tabilities: Object.assign({}, vanillaSpecies.abilities || {}),\n` +
		`\t\t\t\t\tbaseStats: Object.assign({}, vanillaSpecies.baseStats || {}),\n` +
		`\t\t\t\t};\n` +
		`\t\t\t}\n` +
		`\t\t\tfor (var sid in speciesOverrides) {\n` +
		`\t\t\t\tvar speciesData = speciesOverrides[sid];\n` +
		`\t\t\t\tif (!exports.BattlePokedex[sid]) {\n` +
		`\t\t\t\t\texports.BattlePokedex[sid] = Object.assign({ exists: true }, speciesData);\n` +
		`\t\t\t\t} else {\n` +
		`\t\t\t\t\tObject.assign(exports.BattlePokedex[sid], speciesData);\n` +
		`\t\t\t\t}\n` +
		`\t\t\t\tif (shouldExposeCustomForme(speciesData, sid)) {\n` +
		`\t\t\t\t\tvar baseId = toID(speciesData.baseSpecies);\n` +
		`\t\t\t\t\tvar baseSpecies = exports.BattlePokedex[baseId];\n` +
		`\t\t\t\t\tif (baseSpecies) {\n` +
		`\t\t\t\t\t\tbaseSpecies.otherFormes = pushUnique(baseSpecies.otherFormes, speciesData.name || sid);\n` +
		`\t\t\t\t\t}\n` +
		`\t\t\t\t}\n` +
		`\t\t\t}\n` +
		`\t\t}\n` +
		`\t\t// Inject sprite dimensions so the battle scene can find animated GIFs for custom forms.\n` +
		`\t\t// Keys match species.id (e.g. "charizardclone"); the GIF file must be named\n` +
		`\t\t// after species.spriteid (e.g. "charizard-clone.gif") in sprites/ani/ and sprites/ani-back/.\n` +
		`\t\tif (exports.BattlePokemonSprites) {\n` +
		`\t\t\tfor (var spriteSid in relumiSpriteEntries) {\n` +
		`\t\t\t\tif (!exports.BattlePokemonSprites[spriteSid]) {\n` +
		`\t\t\t\t\texports.BattlePokemonSprites[spriteSid] = relumiSpriteEntries[spriteSid];\n` +
		`\t\t\t\t}\n` +
		`\t\t\t}\n` +
		`\t\t}\n` +
		`\t\t// Inject icon sheet slot indexes for custom forms.\n` +
		`\t\t// Slots start at 1641 (after the last upstream slot 1640).\n` +
		`\t\t// Add the corresponding 40x30 icon at that position in pokemonicons-sheet.png.\n` +
		`\t\tif (typeof BattlePokemonIconIndexes !== "undefined") {\n` +
		`\t\t\tfor (var iconSid in relumiIconIndexes) {\n` +
		`\t\t\t\tif (!(iconSid in BattlePokemonIconIndexes)) {\n` +
		`\t\t\t\t\tBattlePokemonIconIndexes[iconSid] = relumiIconIndexes[iconSid];\n` +
		`\t\t\t\t}\n` +
		`\t\t\t}\n` +
		`\t\t\t// Clear stale icon caches so teams re-render with the correct custom icons.\n` +
		`\t\t\t// The app may have built iconCache before this script ran, using num=0 for unknown IDs.\n` +
		`\t\t\tif (typeof Storage !== "undefined" && Array.isArray(Storage.teams)) {\n` +
		`\t\t\t\tfor (var ti = 0; ti < Storage.teams.length; ti++) {\n` +
		`\t\t\t\t\tif (Storage.teams[ti]) Storage.teams[ti].iconCache = "";\n` +
		`\t\t\t\t}\n` +
		`\t\t\t}\n` +
		`\t\t}\n` +
		`\t\tif (exports.BattleMovedex) {\n` +
		`\t\t\tfor (var vanillaMid in moveOverrides) {\n` +
		`\t\t\t\tvar vanillaMove = exports.BattleMovedex[vanillaMid];\n` +
		`\t\t\t\tif (!vanillaMove) continue;\n` +
		`\t\t\t\tvanillaMoveData[vanillaMid] = {\n` +
		`\t\t\t\t\taccuracy: vanillaMove.accuracy,\n` +
		`\t\t\t\t\tbasePower: vanillaMove.basePower,\n` +
		`\t\t\t\t\tshortDesc: gen8MoveDescs[vanillaMid] || vanillaMove.shortDesc || "",\n` +
		`\t\t\t\t};\n` +
		`\t\t\t}\n` +
		`\t\t\tfor (var mid in moveOverrides) {\n` +
		`\t\t\t\tif (!exports.BattleMovedex[mid]) continue;\n` +
		`\t\t\t\tObject.assign(exports.BattleMovedex[mid], moveOverrides[mid]);\n` +
		`\t\t\t}\n` +
		`\t\t}\n` +
		`\t\tif (exports.BattleAbilities) {\n` +
		`\t\t\tvar allAbilityOverrides = Object.assign({}, abilityOverrides);\n` +
		`\t\t\tfor (var vanillaAid in allAbilityOverrides) {\n` +
		`\t\t\t\tvar vanillaAbility = exports.BattleAbilities[vanillaAid];\n` +
		`\t\t\t\tif (!vanillaAbility) continue;\n` +
		`\t\t\t\tvanillaAbilityData[vanillaAid] = {\n` +
		`\t\t\t\t\tshortDesc: gen8AbilityDescs[vanillaAid] || vanillaAbility.shortDesc || "",\n` +
		`\t\t\t\t};\n` +
		`\t\t\t}\n` +
		`\t\t}\n` +
		`\t}\n` +
		`\tvar relumiLearnsets = ${JSON.stringify(relumiLearnsets)};\n` +
		`\tvar tierOverrides = ${JSON.stringify(tierOverrides)};\n` +
		`\tvar abilityOverrides = ${JSON.stringify(abilityOverrides)};\n` +
		`\tvar moveTextOverrides = ${JSON.stringify(moveTextOverrides)};\n` +
		`\tvar relumiBanConfig = ${JSON.stringify(relumiBanConfig)};\n` +
		`\tif (typeof exports !== "undefined" && exports.BattleMovedex) {\n` +
		`\t\tfor (var vanillaTid in moveTextOverrides) {\n` +
		`\t\t\tif (vanillaMoveData[vanillaTid]) continue;\n` +
		`\t\t\tvar vanillaTextMove = exports.BattleMovedex[vanillaTid];\n` +
		`\t\t\tif (!vanillaTextMove) continue;\n` +
		`\t\t\tvanillaMoveData[vanillaTid] = {\n` +
		`\t\t\t\taccuracy: vanillaTextMove.accuracy,\n` +
		`\t\t\t\tbasePower: vanillaTextMove.basePower,\n` +
		`\t\t\t\tshortDesc: gen8MoveDescs[vanillaTid] || vanillaTextMove.shortDesc || "",\n` +
		`\t\t\t};\n` +
		`\t\t}\n` +
		`\t}\n` +
		`\tif (typeof exports === "undefined" || !exports.BattleTeambuilderTable) return;\n` +
		`\tvar table = exports.BattleTeambuilderTable;\n` +
		`\tvar base = table.gen9 || table.gen8;\n` +
		`\tif (!base) return;\n` +
		`\tvar extraTierSpecies = [];\n` +
		`\tfor (var tid in speciesOverrides) {\n` +
		`\t\tif (shouldExposeCustomForme(speciesOverrides[tid], tid)) {\n` +
		`\t\t\textraTierSpecies.push({\n` +
		`\t\t\t\tid: tid,\n` +
		`\t\t\t\tbaseId: toID(speciesOverrides[tid].baseSpecies || ""),\n` +
		`\t\t\t});\n` +
		`\t\t}\n` +
		`\t}\n` +
		`\tvar tiers = base.tiers;\n` +
		`\tif (extraTierSpecies.length) {\n` +
		`\t\tvar seen = Object.create(null);\n` +
		`\t\tvar tierIndexById = Object.create(null);\n` +
		`\t\ttiers = (base.tiers || []).slice();\n` +
		`\t\tfor (var i = 0; i < tiers.length; i++) {\n` +
		`\t\t\tvar entry = tiers[i];\n` +
		`\t\t\tvar tierId = Array.isArray(entry) ? entry[1] : entry;\n` +
		`\t\t\tseen[tierId] = true;\n` +
		`\t\t\tif (!(tierId in tierIndexById)) tierIndexById[tierId] = i;\n` +
		`\t\t}\n` +
		`\t\tvar insertAfterByBase = Object.create(null);\n` +
		`\t\tfor (var j = 0; j < extraTierSpecies.length; j++) {\n` +
		`\t\t\tvar extra = extraTierSpecies[j];\n` +
		`\t\t\tvar extraId = extra.id;\n` +
		`\t\t\tif (seen[extraId]) continue;\n` +
		`\t\t\tvar insertAt = tiers.length;\n` +
		`\t\t\tif (extra.baseId && extra.baseId in tierIndexById) {\n` +
		`\t\t\t\tvar anchor = insertAfterByBase[extra.baseId];\n` +
		`\t\t\t\tif (typeof anchor !== "number") anchor = tierIndexById[extra.baseId];\n` +
		`\t\t\t\tinsertAt = anchor + 1;\n` +
		`\t\t\t}\n` +
		`\t\t\ttiers.splice(insertAt, 0, extraId);\n` +
		`\t\t\tseen[extraId] = true;\n` +
		`\t\t\ttierIndexById[extraId] = insertAt;\n` +
		`\t\t\tif (extra.baseId) insertAfterByBase[extra.baseId] = insertAt;\n` +
		`\t\t\tfor (var existingId in tierIndexById) {\n` +
		`\t\t\t\tif (existingId === extraId) continue;\n` +
		`\t\t\t\tif (tierIndexById[existingId] >= insertAt) tierIndexById[existingId]++;\n` +
		`\t\t\t}\n` +
		`\t\t}\n` +
		`\t}\n` +
		`\ttable.gen8relumi = {\n` +
		`\t\tlearnsets: relumiLearnsets,\n` +
		`\t\ttiers: tiers,\n` +
		`\t\titems: base.items,\n` +
		`\t\toverrideTier: Object.assign({}, base.overrideTier || {}, tierOverrides),\n` +
		`\t\tmetagameBans: base.metagameBans || {},\n` +
		`\t\tformatSlices: base.formatSlices || {},\n` +
		`\t\toverrideSpeciesData: Object.assign({}, base.overrideSpeciesData || {}, speciesOverrides),\n` +
		`\t\toverrideMoveData: Object.assign({}, base.overrideMoveData || {}, moveOverrides, moveTextOverrides),\n` +
		`\t\toverrideAbilityData: Object.assign({}, base.overrideAbilityData || {}, abilityOverrides),\n` +
		`\t\toverrideItemData: Object.assign({}, base.overrideItemData || {}),\n` +
		`\t\trelumiMoveOverrides: Object.assign({}, moveOverrides, moveTextOverrides),\n` +
		`\t\trelumiAbilityOverrides: Object.assign({}, abilityOverrides),\n` +
		`\t\tvanillaSpeciesData: vanillaSpeciesData,\n` +
		`\t\tvanillaMoveData: vanillaMoveData,\n` +
		`\t\tvanillaAbilityData: vanillaAbilityData,\n` +
		`\t\trelumiBanConfig: relumiBanConfig,\n` +
		`\t};\n` +
		`})();\n`;

	fs.mkdirSync(path.dirname(CLIENT_OUT_PATH), { recursive: true });
	fs.writeFileSync(CLIENT_OUT_PATH, text, "utf8");

	console.log("Exported Relumi client overrides:");
	console.log(`- ${CLIENT_LOG_PATH}`);
	console.log(`- Species overrides: ${Object.keys(speciesOverrides).length}`);
	console.log(`- Move overrides: ${Object.keys(moveOverrides).length}`);
	console.log(`- Custom form sprite/icon entries: ${Object.keys(spriteEntries).length}`);
}

try {
	main();
} catch (err) {
	console.error(err);
	process.exit(1);
}
