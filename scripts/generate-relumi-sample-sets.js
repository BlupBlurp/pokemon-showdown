#!/usr/bin/env node
"use strict";

/*
 * Generates gen8relumisinglesou.json (sample sets for TeamBuilder) from
 * in-game trainer data, including all Pokemon (NFE + fully evolved).
 */

const fs = require("fs");
const path = require("path");
const { Dex } = require("../dist/sim/dex");
const { getRelumiRepoRoot } = require("./lib/relumi-paths");
const { computeRelumiRandomBattleSets } = require("./sync-relumi-random-sets");
const { readJson, extractIndexedNames } = require("./lib/relumi-game-files");
const { buildSpeciesIdByMonsForm } = require("./lib/relumi-species-mapping");

const ROOT = getRelumiRepoRoot();
const GAME_FILES_DIR = path.join(ROOT, "game-files");
const CLIENT_PLAY_DIR = path.resolve(
	ROOT, "..", "pokemon-showdown-client", "play.pokemonshowdown.com"
);
const SAMPLE_SETS_PATH = path.join(
	CLIENT_PLAY_DIR, "data", "sets", "gen8relumisinglesou.json"
);

function main() {
	const monsJson = readJson(
		path.join(GAME_FILES_DIR, "english_ss_monsname.json")
	);
	const abilityJson = readJson(
		path.join(GAME_FILES_DIR, "english_ss_tokusei.json")
	);
	const moveJson = readJson(
		path.join(GAME_FILES_DIR, "english_ss_wazaname.json")
	);
	const personalJson = readJson(
		path.join(GAME_FILES_DIR, "PersonalTable.json")
	);
	const trainerJson = readJson(
		path.join(GAME_FILES_DIR, "TrainerTable.json")
	);

	const monsNames = extractIndexedNames(monsJson.labelDataArray || []);
	const abilityNames = extractIndexedNames(
		abilityJson.labelDataArray || []
	);
	const moveNames = extractIndexedNames(moveJson.labelDataArray || []);
	const personalRows = personalJson.Personal || [];
	const trainerRows = trainerJson.TrainerPoke || [];

	const dex = Dex.mod("gen8");

	const speciesIdByMonsForm = buildSpeciesIdByMonsForm(
		personalRows, monsNames, dex
	);

	// mappedSpeciesIds=null skips fallback sets (only actual trainer data)
	// learnsetsDiffs=null is fine since we skip fallback
	const result = computeRelumiRandomBattleSets({
		trainerRows,
		abilityNames,
		moveNames,
		dex,
		speciesIdByMonsForm,
		mappedSpeciesIds: null,
		learnsetsDiffs: null,
		includeNfe: true,
	});

	const singlesSets = result.singlesSets || {};

	// Convert to sample sets format: { dex: { SpeciesName: { SetName: PokemonSet } } }
	const dexEntries = {};
	for (const [speciesId, data] of Object.entries(singlesSets)) {
		const species = dex.species.get(speciesId);
		const displayName = species.exists ? species.name : speciesId;

		const sets = {};
		for (const setEntry of data.sets || []) {
			const ability = (setEntry.abilities && setEntry.abilities[0]) || "No Ability";
			const role = setEntry.role || "Set";
			const trainerTag = setEntry.trainerId ? ` - ID ${setEntry.trainerId}` : "";
			const baseSetName = `${ability} (${role})${trainerTag}`;

			const pokemonSet = {
				species: displayName,
				moves: setEntry.movepool || [],
				ability,
			};
			if (setEntry.item && setEntry.item.length) {
				pokemonSet.item = setEntry.item[0];
			}
			if (setEntry.nature && setEntry.nature.length) {
				pokemonSet.nature = setEntry.nature[0];
			}
			if (setEntry.evs) {
				pokemonSet.evs = setEntry.evs;
			}

			// Ensure unique set name
			let setName = baseSetName;
			let counter = 1;
			while (sets[setName]) {
				counter++;
				setName = `${baseSetName} ${counter}`;
			}
			sets[setName] = pokemonSet;
		}

		if (Object.keys(sets).length) {
			dexEntries[displayName] = sets;
		}
	}

	const output = { dex: dexEntries };

	fs.mkdirSync(path.dirname(SAMPLE_SETS_PATH), { recursive: true });
	fs.writeFileSync(SAMPLE_SETS_PATH, JSON.stringify(output, null, 2), "utf8");

	const totalSets = Object.values(dexEntries).reduce(
		(sum, s) => sum + Object.keys(s).length, 0
	);
	console.log(`Sample sets written to ${SAMPLE_SETS_PATH}`);
	console.log(`Species: ${Object.keys(dexEntries).length}`);
	console.log(`Total sets: ${totalSets}`);
}

main();
