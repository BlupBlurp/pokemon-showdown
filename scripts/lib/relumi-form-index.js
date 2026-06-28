"use strict";

/**
 * Compute the form index for a single species.
 *
 * @param {string} sid        - Species ID (e.g. "charizardmegax")
 * @param {string} baseId     - Base species ID (e.g. "charizard")
 * @param {string[]} foIDs    - FormeOrder IDs (e.g. ["charizard", "charizardmegax", ...])
 * @param {boolean} hasGmax   - Whether a Gmax form exists for this base species
 * @param {string[]} customIDs - Sorted list of custom form IDs (non-base, non-formeOrder, non-gmax)
 * @returns {number} form index, or -1 if not found
 */
function computeFormIndex(sid, baseId, foIDs, hasGmax, customIDs) {
	if (sid === baseId) return 0;
	const fi = foIDs.indexOf(sid);
	if (fi >= 0) return fi;
	if (sid === baseId + "gmax" || (sid.endsWith("gmax") && hasGmax)) {
		return foIDs.length;
	}
	const offset = hasGmax ? foIDs.length + 1 : foIDs.length;
	const oi = customIDs.indexOf(sid);
	return oi >= 0 ? offset + oi : -1;
}

/**
 * Build a full speciesId → formIndex map from a Dex.
 */
function buildFormIndexMap(dex, toID) {
	const map = {};
	const speciesList = dex.species.all();

	const groups = {};
	for (const species of speciesList) {
		const baseId = toID(species.baseSpecies || species.name);
		if (!groups[baseId]) groups[baseId] = [];
		groups[baseId].push(species);
	}

	for (const [baseId, forms] of Object.entries(groups)) {
		const baseSpecies = dex.species.get(baseId);
		if (!baseSpecies.exists) continue;

		const foIDs = (baseSpecies.formeOrder || [baseSpecies.name]).map(f => toID(f));
		const gmaxId = baseId + "gmax";
		const hasGmax = dex.species.get(gmaxId).exists;
		const customIDs = forms
			.map(f => f.id)
			.filter(f => f !== baseId && foIDs.indexOf(f) === -1 && f !== gmaxId && f.indexOf("gmax") === -1);
		customIDs.sort();

		for (const species of forms) {
			const idx = computeFormIndex(species.id, baseId, foIDs, hasGmax, customIDs);
			if (idx >= 0) map[species.id] = idx;
		}
	}

	return map;
}

module.exports = { computeFormIndex, buildFormIndexMap };
