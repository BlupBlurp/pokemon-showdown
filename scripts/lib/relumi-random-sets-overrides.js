"use strict";

// Manual species bans for Relumi random battle set generation.
// Use this list to exclude species that are otherwise valid (not NFE, not
// mega/primal/gmax) but should not appear in generated random sets.
//
// Entries are Showdown species IDs (lowercase, no spaces). Listed species are
// fully excluded from both trainer-derived and fallback candidate sets.
const MANUAL_RANDOM_SETS_BANS = new Set([
	// Event-only formes that exist in the dex but are not legal in Relumi.
	"pichuspikyeared",
]);

module.exports = { MANUAL_RANDOM_SETS_BANS };
