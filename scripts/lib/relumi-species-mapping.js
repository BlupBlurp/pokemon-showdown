"use strict";

const { compareJson } = require("./relumi-deep-sort");
const { FORM_NUMBER_SPECIES_OVERRIDES } = require("./relumi-pokedex-overrides");
const { deriveFormNo } = require("./relumi-game-files");
const { toID } = require("../../dist/sim/dex");

// --- Form label normalisation helpers ---

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
	const stripped = labelTokens.filter(token => !baseTokens.includes(token));
	if (stripped.length) variants.add(stripped.join(" "));

	return Array.from(variants);
}

function collectBaseFormCandidates(baseSpecies, dex) {
	const candidates = [];
	const seen = new Set();

	const tryPush = speciesName => {
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

// --- Species-to-form resolution ---

/**
 * Map a BDSP (monsNo, formNo) pair to a Showdown species.
 *
 * Resolution order:
 * 1. FORM_NUMBER_SPECIES_OVERRIDES — explicit mapping (strict: no fallback).
 * 2. formNo === 0 → base species.
 * 3. baseSpecies.formeOrder[formNo].
 * 4. baseSpecies.otherFormes[formNo - 1].
 * 5. Form label token matching against all same-baseSpecies formes.
 * 6. Stats + typing exact-match fallback (if provided).
 *
 * @param {object} baseSpecies - Dex species object for the base form.
 * @param {number} monsNo - BDSP monster number.
 * @param {number} formNo - BDSP form number.
 * @param {string} [formLabel] - BDSP form display label (for token matching).
 * @param {string[]} [types] - BDSP-extracted types (for fallback matching).
 * @param {object} [baseStats] - BDSP-extracted base stats (for fallback matching).
 * @param {object} dex - Dex instance.
 * @returns {object|null} The mapped Dex species, or null.
 */
function findMappedSpeciesForForm(
	baseSpecies,
	monsNo,
	formNo,
	formLabel,
	types,
	baseStats,
	dex
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
		baseSpecies.baseSpecies
	);
	if (!labelVariants.length) return null;

	const baseId = toID(baseSpecies.baseSpecies);
	const candidates = collectBaseFormCandidates(baseSpecies, dex);
	for (const candidate of candidates) {
		const candidateTokens = new Set();
		const formeToken = normalizeFormForMatch(candidate.forme || "");
		if (formeToken) candidateTokens.add(formeToken);

		const nameSuffix = candidate.name.startsWith(`${baseSpecies.baseSpecies}-`) ? candidate.name.slice(baseSpecies.baseSpecies.length + 1) : candidate.name;
		const nameToken = normalizeFormForMatch(nameSuffix);
		if (nameToken) candidateTokens.add(nameToken);

		let idSuffix = candidate.id;
		if (idSuffix.startsWith(baseId)) idSuffix = idSuffix.slice(baseId.length);
		const idToken = normalizeFormForMatch(idSuffix);
		if (idToken) candidateTokens.add(idToken);

		// Sort tokens for order-independent matching (e.g., "gmax rapid strike"
		// vs "rapid strike gmax").
		const sortTokens = str =>
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
			candidate =>
				compareJson(candidate.types, types) &&
				compareJson(candidate.baseStats, baseStats)
		);
		if (byData.length === 1) return byData[0];
	}

	return null;
}

// --- Utility: build a speciesId map from Personal table rows ---

/**
 * Walk the Personal table and build a Map<"monsNo_formNo", speciesId>.
 * Only includes rows whose base species exists in the Dex.
 * This is the common mapping used by both the sync pipeline and the
 * sample-set generator.
 *
 * @param {object[]} personalRows
 * @param {Map<number, string>} monsNames - BDSP monster name index.
 * @param {object} dex - Dex instance.
 * @returns {Map<string, string>}
 */
function buildSpeciesIdByMonsForm(personalRows, monsNames, dex) {
	const map = new Map();
	for (const row of personalRows) {
		if (!row || row.valid_flag !== 1) continue;
		if (!row.monsno || row.monsno <= 0) continue;
		const baseName = (monsNames.get(row.monsno) || "").trim();
		if (!baseName) continue;
		const baseSpecies = dex.species.get(baseName);
		if (!baseSpecies.exists) continue;
		const formNo = deriveFormNo(row);
		const resolved = findMappedSpeciesForForm(
			baseSpecies, row.monsno, formNo, undefined, undefined, undefined, dex
		);
		if (resolved && resolved.exists) {
			map.set(`${row.monsno}_${formNo}`, resolved.id);
		}
	}
	return map;
}

module.exports = {
	findMappedSpeciesForForm,
	buildSpeciesIdByMonsForm,
	normalizeForTokenization,
	normalizeFormForMatch,
};
