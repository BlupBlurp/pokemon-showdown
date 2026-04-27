"use strict";

const path = require("path");

/** Repo root (pokemon-showdown/) for scripts that live under scripts/lib/. */
function getRelumiRepoRoot() {
	return path.resolve(__dirname, "..", "..");
}

module.exports = { getRelumiRepoRoot };
