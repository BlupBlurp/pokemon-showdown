"use strict";

// Manual species bans for Relumi random battle set generation: species that
// pass the normal filters (not NFE, not mega/primal/gmax) but shouldn't
// appear in generated sets. Entries are Showdown species IDs; listed species
// are excluded from both trainer-derived and fallback candidate sets.
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
