"use strict";

function deepSort(value) {
	if (Array.isArray(value)) return value.map(deepSort);
	if (!value || typeof value !== "object") return value;
	const sorted = {};
	for (const key of Object.keys(value).sort()) {
		sorted[key] = deepSort(value[key]);
	}
	return sorted;
}

/** Stable JSON equality for mod diff objects (sorted keys). */
function compareJson(a, b) {
	return JSON.stringify(deepSort(a)) === JSON.stringify(deepSort(b));
}

module.exports = { deepSort, compareJson };
