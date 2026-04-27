"use strict";

const fs = require("fs");
const vm = require("vm");

/**
 * Best-effort parse of `export const Name = ...` object literals from TS files.
 * @param {string} tsPath
 * @param {string} exportName
 * @param {{ silent?: boolean }} [options] - if silent, skip console.warn on failure
 */
function parseExportedObject(tsPath, exportName, options = {}) {
	const { silent = false } = options;
	if (!fs.existsSync(tsPath)) return {};
	const source = fs.readFileSync(tsPath, "utf8");
	const exportRegex = new RegExp(
		`export\\s+const\\s+${exportName}\\s*(?::[^=]*)?\\s*=`,
		"m"
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
	} catch (err) {
		if (!silent) {
			console.warn(
				`[relumi] Failed to parse export "${exportName}" in ${tsPath}: ${err.message}`
			);
		}
		return {};
	}
}

module.exports = { parseExportedObject };
