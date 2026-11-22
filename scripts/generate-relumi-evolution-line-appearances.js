#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { Dex, toID } = require("../dist/sim/dex");
const { getRelumiRepoRoot } = require("./lib/relumi-paths");
const { readYaml, extractIndexedNames } = require("./lib/relumi-game-files");
const { buildSpeciesIdByMonsForm } = require("./lib/relumi-species-mapping");
const { FORM_NUMBER_SPECIES_OVERRIDES } = require("./lib/relumi-pokedex-overrides");

const ROOT = getRelumiRepoRoot();
const GAME_FILES_DIR = path.join(ROOT, "game-files");
const OUTPUT_PATH = path.join(
	ROOT,
	"scripts",
	"dev-utility",
	"relumi-evolution-line-trainer-appearances.csv"
);

const dex = Dex.mod("gen8relumi");

const PIKACHU_CAP_FORMES = new Set([
	"original",
	"hoenn",
	"sinnoh",
	"unova",
	"kalos",
	"alola",
	"partner",
	"world",
]);

const ITEM_FORME_BASES = new Set(["Arceus", "Silvally", "Genesect"]);
const UNFLAGGED_BATTLE_FORMES = new Set(["eternatuseternamax"]);

function readFormatBanlist(source, name) {
	const start = source.indexOf(`const ${name} = [`);
	const end = source.indexOf("] as const;", start);
	if (start < 0 || end < 0) {
		throw new Error(`Could not find ${name} in config/formats.ts`);
	}
	const block = source.slice(start, end);
	return new Set([...block.matchAll(/"([^"]+)"/g)].map(match => toID(match[1])));
}

function isBattleForm(species) {
	if (!species.forme) return false;
	if (species.isMega || species.isPrimal || species.battleOnly) return true;
	if (species.forme === "Gmax") return true;
	if (ITEM_FORME_BASES.has(species.baseSpecies)) return true;
	return UNFLAGGED_BATTLE_FORMES.has(species.id);
}

function isCosmeticForm(species) {
	if (!species.forme || species.baseSpecies === species.name) return false;
	if (isBattleForm(species)) return false;
	const base = dex.species.get(species.baseSpecies);
	if (!base.exists) return false;
	if (species.types.join() !== base.types.join()) return false;
	const stats = Object.keys(base.baseStats).map(stat => species.baseStats[stat]).join();
	if (stats !== Object.values(base.baseStats).join()) return false;
	const abilities = value => JSON.stringify(Object.entries(value.abilities).sort());
	return abilities(species) === abilities(base);
}

// Battle only and cosmetic formes count towards their base species
function entrySpecies(species) {
	if (isBattleForm(species) || isCosmeticForm(species)) {
		const base = dex.species.get(species.baseSpecies);
		if (base.exists) return base;
	}
	return species;
}

function isRelumiLegal(species, baseBanlist, gen9Unban) {
	if (species.isNonstandard === "CAP" || species.isNonstandard === "Custom") return false;
	if (species.isNonstandard === "Future" && !gen9Unban.has(species.id)) return false;
	if (species.isNonstandard && !["Past", "Future"].includes(species.isNonstandard)) return false;
	if (baseBanlist.has(species.id)) return false;
	if (species.isMega || species.placeholderFor) return false;
	if (/(?:Tera|Terastal|Stellar)$/.test(species.forme || "")) return false;
	if (species.baseSpecies === "Pikachu" &&
		PIKACHU_CAP_FORMES.has((species.forme || "").toLowerCase())) return false;
	return true;
}

function lineRoot(species) {
	let root = species;
	const seen = new Set([root.id]);
	while (root.prevo) {
		const prevo = dex.species.get(root.prevo);
		if (!prevo.exists || seen.has(prevo.id)) break;
		seen.add(prevo.id);
		root = prevo;
	}
	return root.id;
}

function resolveSpecies(monsNo, formNo, speciesIdByMonsForm) {
	const overrides = FORM_NUMBER_SPECIES_OVERRIDES[monsNo];
	if (overrides && overrides[formNo]) {
		const species = dex.species.get(overrides[formNo]);
		return species.exists ? species : null;
	}
	const id = speciesIdByMonsForm.get(`${monsNo}_${formNo}`) ||
		speciesIdByMonsForm.get(`${monsNo}_0`);
	return id ? dex.species.get(id) : null;
}

function collectTeams(trainerRows) {
	const teams = new Set();
	for (const row of trainerRows) {
		if (!row.ID) continue;
		const slots = [];
		for (let slot = 1; slot <= 6; slot++) {
			const monsNo = Number(row[`P${slot}MonsNo`] || 0);
			const formNo = Number(row[`P${slot}FormNo`] || 0);
			slots.push(monsNo ? `${monsNo}.${formNo}` : "");
		}
		const signature = slots.join(",");
		if (!signature.replace(/,/g, "")) continue;
		teams.add(signature);
	}
	return teams;
}

function indexTeams(teams, speciesIdByMonsForm) {
	const teamsByEntry = new Map();
	for (const team of teams) {
		const entryIds = new Set();
		for (const slot of team.split(",")) {
			if (!slot) continue;
			const [monsNo, formNo] = slot.split(".").map(Number);
			const species = resolveSpecies(monsNo, formNo, speciesIdByMonsForm);
			if (species) entryIds.add(entrySpecies(species).id);
		}
		for (const id of entryIds) {
			if (!teamsByEntry.has(id)) teamsByEntry.set(id, new Set());
			teamsByEntry.get(id).add(team);
		}
	}
	return teamsByEntry;
}

function csvField(value) {
	const text = String(value);
	return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function main() {
	const formatsSource = fs.readFileSync(path.join(ROOT, "config", "formats.ts"), "utf8");
	const baseBanlist = readFormatBanlist(formatsSource, "RELUMI_BASE_BANLIST");
	const gen9Unban = readFormatBanlist(formatsSource, "RELUMI_GEN9_UNBANLIST");

	const personalRows = readYaml(path.join(GAME_FILES_DIR, "PersonalTable.asset")).Personal || [];
	const monsNames = extractIndexedNames(
		readYaml(path.join(GAME_FILES_DIR, "english_ss_monsname.asset")).labelDataArray || []
	);
	const speciesIdByMonsForm = buildSpeciesIdByMonsForm(personalRows, monsNames, dex);

	const trainerRows = readYaml(path.join(GAME_FILES_DIR, "TrainerTable.asset")).TrainerPoke || [];
	const teams = collectTeams(trainerRows);
	const teamsByEntry = indexTeams(teams, speciesIdByMonsForm);

	const families = new Map();
	for (const species of dex.species.all()) {
		if (!species.exists) continue;
		if (!species.gen) continue;
		const entry = entrySpecies(species);
		const root = lineRoot(entry);
		if (!families.has(root)) families.set(root, new Map());
		families.get(root).set(entry.id, entry);
	}

	const entries = [];
	for (const [root, memberMap] of families) {
		const members = [...memberMap.values()]
			.sort((a, b) => a.num - b.num || a.name.localeCompare(b.name));
		if (!members.some(member => isRelumiLegal(member, baseBanlist, gen9Unban))) continue;
		const lineTeams = new Set();
		for (const member of members) {
			for (const team of teamsByEntry.get(member.id) || []) lineTeams.add(team);
		}
		entries.push({
			name: dex.species.get(root).name,
			count: lineTeams.size,
			perSpecies: members.length > 1
				? members.map(member =>
					`${member.name} (${(teamsByEntry.get(member.id) || new Set()).size})`
				).join("; ")
				: "",
		});
	}
	entries.sort((a, b) => a.count - b.count || a.name.localeCompare(b.name));

	const lines = ["Evolution Line,Distinct Teams,Species Counts"];
	for (const entry of entries) {
		lines.push([
			csvField(entry.name),
			entry.count,
			csvField(entry.perSpecies),
		].join(","));
	}
	fs.writeFileSync(OUTPUT_PATH, `${lines.join("\n")}\n`, "utf8");

	const missing = entries.filter(entry => entry.count === 0).length;
	console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)}`);
	console.log(`${entries.length} lines (${missing} with no appearances), ${teams.size} distinct teams`);
}

try {
	main();
} catch (err) {
	console.error(err);
	process.exit(1);
}
