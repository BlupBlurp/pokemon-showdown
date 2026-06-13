"use strict";

// Manual species bans for Relumi random battle set generation.
// Use this list to exclude species that are otherwise valid (not NFE, not
// mega/primal/gmax) but should not appear in generated random sets.
//
// Entries are Showdown species IDs (lowercase, no spaces). Listed species are
// fully excluded from both trainer-derived and fallback candidate sets.
const MANUAL_RANDOM_SETS_BANS = new Set([
	"pichuspikyeared",
	"aegislashblade",
	"castformrainy",
	"castformsunny",
	"castformsnowy",
	"cherrimsunshine",
	"cramorantgorging",
	"cramorantgulping",
	"darmanitangalarzen",
	"darmanitanzen",
	"dudunsparcethreesegment",
	"eiscuenoice",
	"eternatuseternamax",
	"genesectburn",
	"genesectchill",
	"genesectdouse",
	"genesectshock",
	"greninjaash",
	"mausholdfour",
	"mimikyubusted",
	"morpekohangry",
	"necrozmaultra",
	"ogerpon",
	"palafinhero",
	"pikachucosplay",
	"sinistchamasterpiece",
	"terapagosstellar",
	"terapagosterastal",
	"wishiwashischool",
	"zarudedada",
	"zygardecomplete",
]);

module.exports = { MANUAL_RANDOM_SETS_BANS };
