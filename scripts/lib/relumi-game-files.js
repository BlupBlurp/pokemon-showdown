"use strict";

const fs = require("fs");
const yaml = require("js-yaml");

/** Read and parse a JSON file. Fails the process on error (sync scripts only). */
function readJson(filePath) {
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf8"));
	} catch (err) {
		console.error(`Failed to read or parse JSON: ${filePath}`);
		console.error(err.message);
		process.exit(1);
	}
}

/**
 * Read a Unity TextAsset YAML file and return its MonoBehaviour payload.
 * The game files ship as Unity YAML; the metadata envelope is dropped so
 * callers see the same shape the old JSON exports had.
 */
function readYaml(filePath) {
	try {
		const raw = fs.readFileSync(filePath, "utf8");
		// strip Unity's YAML directives and `!u!` document tag for js-yaml
		const body = raw
			.replace(/^%YAML[^\n]*\n/, "")
			.replace(/^%TAG[^\n]*\n/, "")
			.replace(/^--- !u!\d+.*$/m, "---");
		const doc = yaml.load(body);
		return doc && doc.MonoBehaviour ? doc.MonoBehaviour : doc;
	} catch (err) {
		console.error(`Failed to read or parse YAML: ${filePath}`);
		console.error(err.message);
		process.exit(1);
	}
}

/**
 * Extract the display string from a BDSP label-data entry.
 * Used by both sync-relumi and generate-relumi-sample-sets to read
 * species, ability, and move name tables.
 */
function getLabelString(entry) {
	if (!entry || !entry.wordDataArray || !entry.wordDataArray.length) return "";
	const firstWord = entry.wordDataArray[0];
	if (!firstWord || typeof firstWord.str !== "string") return "";
	// typographic apostrophes don't match Showdown's move/species names
	return firstWord.str.trim().replace(/\u2019/g, "'");
}

/** Build a Map<index, labelString> from a BDSP label-data array. */
function extractIndexedNames(labelDataArray) {
	const map = new Map();
	for (const entry of labelDataArray) {
		if (!entry || typeof entry.arrayIndex !== "number") continue;
		map.set(entry.arrayIndex, getLabelString(entry));
	}
	return map;
}

/**
 * Derive the BDSP form number from a Personal table row.
 * formNo 0 = base species; formNo ≥ 1 = alternate form.
 */
function deriveFormNo(row) {
	if (row.id === row.monsno) return 0;
	if (row.form_max > 1 && row.id >= row.form_index) {
		const formNo = row.id - row.form_index + 1;
		if (formNo >= 1 && formNo <= row.form_max - 1) return formNo;
	}
	return 0;
}

module.exports = { readJson, readYaml, getLabelString, extractIndexedNames, deriveFormNo };
