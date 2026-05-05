"use strict";

// Form number to species name mappings for specific species that have game-file
// form indices not aligned with Showdown's formeOrder/otherFormes ordering.
const FORM_NUMBER_SPECIES_OVERRIDES = {
	25: {
		1: "Pikachu-Cosplay",
		2: "Pikachu-Rock-Star",
		3: "Pikachu-Belle",
		4: "Pikachu-Pop-Star",
		5: "Pikachu-PhD",
		6: "Pikachu-Libre",
		7: "Pikachu-Original",
		8: "Pikachu-Starter",
		9: "Pikachu-Gmax",
		10: "Pikachu-Clone",
	},
	// formNo 2 is the custom "GHOST" form; map it to a non-existent name so
	// the strict-override path returns null and triggers custom form creation.
	105: {
		0: "Marowak",
		1: "Marowak-Alola",
		2: "Marowak-Ghost",
	},
	892: {
		0: "Urshifu",
		1: "Urshifu-Rapid-Strike",
		2: "Urshifu-Gmax",
		3: "Urshifu-Rapid-Strike-Gmax",
	},
	774: {
		0: "Minior-Meteor",
		1: "Minior-Meteor-Orange",
		2: "Minior-Meteor-Yellow",
		3: "Minior-Meteor-Green",
		4: "Minior-Meteor-Blue",
		5: "Minior-Meteor-Indigo",
		6: "Minior-Meteor-Violet",
		7: "Minior",
		// Forms 8-13: omit from override; game files extract meteor and core variants.
	},
	// Other cosmetic forms are mapped to the base species, they could be added here if there are ever individual balance changes
	666: {
		18: "Vivillon-Fancy",
		19: "Vivillon-Pokeball",
	},
	849: {
		0: "Toxtricity",
		1: "Toxtricity-Low-Key",
		2: "Toxtricity-Gmax",
		3: "Toxtricity-Low-Key-Gmax",
	},
	869: {
		0: "Alcremie",
		1: "Alcremie-Ruby-Cream",
		2: "Alcremie-Matcha-Cream",
		3: "Alcremie-Mint-Cream",
		4: "Alcremie-Lemon-Cream",
		5: "Alcremie-Salted-Cream",
		6: "Alcremie-Ruby-Swirl",
		7: "Alcremie-Caramel-Swirl",
		8: "Alcremie-Rainbow-Swirl",
		9: "Alcremie-Gmax",
	},
};

// Species that have form entries in extracted game files that should stay
// cosmetic in Showdown. Map those rows to the base species instead of
// generating synthetic custom forms.
const CUSTOM_FORM_BASE_SPECIES_EXCEPTIONS = new Set([
	"unown",
	"sawsbuck",
	"florges",
	"alcremie",
	"furfrou",
	"vivillon",
	// Relumi custom cosmetic variants — no game-file form rows, but listed here
	// so any future game-file rows for these species don't generate synthetic forms.
	"arbok",
	"magikarp",
	"smeargle",
]);

// Manual learnset overrides that must persist across sync runs.
// These are not always represented in extracted learnset tables.
const MANUAL_LEARNSET_OVERRIDES = {
	rotomheat: {
		overheat: ["9L1"],
	},
	rotomwash: {
		hydropump: ["9L1"],
	},
	rotomfrost: {
		blizzard: ["9L1"],
	},
	rotomfan: {
		airslash: ["9L1"],
	},
	rotommow: {
		leafstorm: ["9L1"],
	},
};

// Manual pokedex overrides that must persist across sync runs.
// Use for hardcoding species data not represented in extracted game files.
const MANUAL_POKEDEX_OVERRIDES = {
	calyrexice: {
		abilities: {
			"0": "As One (Glastrier)",
		},
	},
	calyrexshadow: {
		abilities: {
			"0": "As One (Spectrier)",
		},
	},

	// --- Arbok cosmetic variants (v1–v5) ---
	arbok: {
		cosmeticFormes: ["Arbok-V1", "Arbok-V2", "Arbok-V3", "Arbok-V4", "Arbok-V5"],
	},
	arbokv1: { isCosmeticForme: true, name: "Arbok-V1", baseSpecies: "Arbok", forme: "V1", color: "Purple" },
	arbokv2: { isCosmeticForme: true, name: "Arbok-V2", baseSpecies: "Arbok", forme: "V2", color: "Purple" },
	arbokv3: { isCosmeticForme: true, name: "Arbok-V3", baseSpecies: "Arbok", forme: "V3", color: "Purple" },
	arbokv4: { isCosmeticForme: true, name: "Arbok-V4", baseSpecies: "Arbok", forme: "V4", color: "Purple" },
	arbokv5: { isCosmeticForme: true, name: "Arbok-V5", baseSpecies: "Arbok", forme: "V5", color: "Purple" },

	// --- Magikarp cosmetic variants (v1–v32) ---
	magikarp: {
		inherit: true,
		cosmeticFormes: [
			"Magikarp-V1", "Magikarp-V2", "Magikarp-V3", "Magikarp-V4",
			"Magikarp-V5", "Magikarp-V6", "Magikarp-V7", "Magikarp-V8",
			"Magikarp-V9", "Magikarp-V10", "Magikarp-V11", "Magikarp-V12",
			"Magikarp-V13", "Magikarp-V14", "Magikarp-V15", "Magikarp-V16",
			"Magikarp-V17", "Magikarp-V18", "Magikarp-V19", "Magikarp-V20",
			"Magikarp-V21", "Magikarp-V22", "Magikarp-V23", "Magikarp-V24",
			"Magikarp-V25", "Magikarp-V26", "Magikarp-V27", "Magikarp-V28",
			"Magikarp-V29", "Magikarp-V30", "Magikarp-V31", "Magikarp-V32",
		],
	},
	magikarpv1: { isCosmeticForme: true, name: "Magikarp-V1", baseSpecies: "Magikarp", forme: "V1", color: "Red" },
	magikarpv2: { isCosmeticForme: true, name: "Magikarp-V2", baseSpecies: "Magikarp", forme: "V2", color: "Red" },
	magikarpv3: { isCosmeticForme: true, name: "Magikarp-V3", baseSpecies: "Magikarp", forme: "V3", color: "Red" },
	magikarpv4: { isCosmeticForme: true, name: "Magikarp-V4", baseSpecies: "Magikarp", forme: "V4", color: "Red" },
	magikarpv5: { isCosmeticForme: true, name: "Magikarp-V5", baseSpecies: "Magikarp", forme: "V5", color: "Red" },
	magikarpv6: { isCosmeticForme: true, name: "Magikarp-V6", baseSpecies: "Magikarp", forme: "V6", color: "Red" },
	magikarpv7: { isCosmeticForme: true, name: "Magikarp-V7", baseSpecies: "Magikarp", forme: "V7", color: "Red" },
	magikarpv8: { isCosmeticForme: true, name: "Magikarp-V8", baseSpecies: "Magikarp", forme: "V8", color: "Red" },
	magikarpv9: { isCosmeticForme: true, name: "Magikarp-V9", baseSpecies: "Magikarp", forme: "V9", color: "Red" },
	magikarpv10: { isCosmeticForme: true, name: "Magikarp-V10", baseSpecies: "Magikarp", forme: "V10", color: "Red" },
	magikarpv11: { isCosmeticForme: true, name: "Magikarp-V11", baseSpecies: "Magikarp", forme: "V11", color: "Red" },
	magikarpv12: { isCosmeticForme: true, name: "Magikarp-V12", baseSpecies: "Magikarp", forme: "V12", color: "Red" },
	magikarpv13: { isCosmeticForme: true, name: "Magikarp-V13", baseSpecies: "Magikarp", forme: "V13", color: "Red" },
	magikarpv14: { isCosmeticForme: true, name: "Magikarp-V14", baseSpecies: "Magikarp", forme: "V14", color: "Red" },
	magikarpv15: { isCosmeticForme: true, name: "Magikarp-V15", baseSpecies: "Magikarp", forme: "V15", color: "Red" },
	magikarpv16: { isCosmeticForme: true, name: "Magikarp-V16", baseSpecies: "Magikarp", forme: "V16", color: "Red" },
	magikarpv17: { isCosmeticForme: true, name: "Magikarp-V17", baseSpecies: "Magikarp", forme: "V17", color: "Red" },
	magikarpv18: { isCosmeticForme: true, name: "Magikarp-V18", baseSpecies: "Magikarp", forme: "V18", color: "Red" },
	magikarpv19: { isCosmeticForme: true, name: "Magikarp-V19", baseSpecies: "Magikarp", forme: "V19", color: "Red" },
	magikarpv20: { isCosmeticForme: true, name: "Magikarp-V20", baseSpecies: "Magikarp", forme: "V20", color: "Red" },
	magikarpv21: { isCosmeticForme: true, name: "Magikarp-V21", baseSpecies: "Magikarp", forme: "V21", color: "Red" },
	magikarpv22: { isCosmeticForme: true, name: "Magikarp-V22", baseSpecies: "Magikarp", forme: "V22", color: "Red" },
	magikarpv23: { isCosmeticForme: true, name: "Magikarp-V23", baseSpecies: "Magikarp", forme: "V23", color: "Red" },
	magikarpv24: { isCosmeticForme: true, name: "Magikarp-V24", baseSpecies: "Magikarp", forme: "V24", color: "Red" },
	magikarpv25: { isCosmeticForme: true, name: "Magikarp-V25", baseSpecies: "Magikarp", forme: "V25", color: "Red" },
	magikarpv26: { isCosmeticForme: true, name: "Magikarp-V26", baseSpecies: "Magikarp", forme: "V26", color: "Red" },
	magikarpv27: { isCosmeticForme: true, name: "Magikarp-V27", baseSpecies: "Magikarp", forme: "V27", color: "Red" },
	magikarpv28: { isCosmeticForme: true, name: "Magikarp-V28", baseSpecies: "Magikarp", forme: "V28", color: "Red" },
	magikarpv29: { isCosmeticForme: true, name: "Magikarp-V29", baseSpecies: "Magikarp", forme: "V29", color: "Red" },
	magikarpv30: { isCosmeticForme: true, name: "Magikarp-V30", baseSpecies: "Magikarp", forme: "V30", color: "Red" },
	magikarpv31: { isCosmeticForme: true, name: "Magikarp-V31", baseSpecies: "Magikarp", forme: "V31", color: "Red" },
	magikarpv32: { isCosmeticForme: true, name: "Magikarp-V32", baseSpecies: "Magikarp", forme: "V32", color: "Red" },

	// Alcremie sweet-decoration cosmetic formes
	// Each of the 9 cream forms gets 6 sweet variants (Berry, Love, Star, Clover, Flower, Ribbon).
	// baseSpecies for sweet variants is the cream form name so the variant picker groups them correctly.
	alcremie: {
		cosmeticFormes: [
			"Alcremie-Berry", "Alcremie-Love", "Alcremie-Star",
			"Alcremie-Clover", "Alcremie-Flower", "Alcremie-Ribbon", 
			"Alcremie-Ruby-Cream", "Alcremie-Matcha-Cream", "Alcremie-Mint-Cream",
			"Alcremie-Lemon-Cream", "Alcremie-Salted-Cream", "Alcremie-Ruby-Swirl",
			"Alcremie-Caramel-Swirl", "Alcremie-Rainbow-Swirl",
		],
	},
	alcremieberry:  { isCosmeticForme: true, name: "Alcremie-Berry",  baseSpecies: "Alcremie", forme: "Berry",  color: "White" },
	alcremielove:   { isCosmeticForme: true, name: "Alcremie-Love",   baseSpecies: "Alcremie", forme: "Love",   color: "White" },
	alcremiestar:   { isCosmeticForme: true, name: "Alcremie-Star",   baseSpecies: "Alcremie", forme: "Star",   color: "White" },
	alcremieclover: { isCosmeticForme: true, name: "Alcremie-Clover", baseSpecies: "Alcremie", forme: "Clover", color: "White" },
	alcremieflower: { isCosmeticForme: true, name: "Alcremie-Flower", baseSpecies: "Alcremie", forme: "Flower", color: "White" },
	alcremieribbon: { isCosmeticForme: true, name: "Alcremie-Ribbon", baseSpecies: "Alcremie", forme: "Ribbon", color: "White" },

	alcremierubycream: {
		inherit: true,
		cosmeticFormes: [
			"Alcremie-Ruby-Cream-Berry", "Alcremie-Ruby-Cream-Love", "Alcremie-Ruby-Cream-Star",
			"Alcremie-Ruby-Cream-Clover", "Alcremie-Ruby-Cream-Flower", "Alcremie-Ruby-Cream-Ribbon",
		],
	},
	alcremierubycreamberry:  { isCosmeticForme: true, name: "Alcremie-Ruby-Cream-Berry",  baseSpecies: "Alcremie-Ruby-Cream", forme: "Berry",  color: "Pink" },
	alcremierubycreamlove:   { isCosmeticForme: true, name: "Alcremie-Ruby-Cream-Love",   baseSpecies: "Alcremie-Ruby-Cream", forme: "Love",   color: "Pink" },
	alcremierubycreamstar:   { isCosmeticForme: true, name: "Alcremie-Ruby-Cream-Star",   baseSpecies: "Alcremie-Ruby-Cream", forme: "Star",   color: "Pink" },
	alcremierubycreamclover: { isCosmeticForme: true, name: "Alcremie-Ruby-Cream-Clover", baseSpecies: "Alcremie-Ruby-Cream", forme: "Clover", color: "Pink" },
	alcremierubycreamflower: { isCosmeticForme: true, name: "Alcremie-Ruby-Cream-Flower", baseSpecies: "Alcremie-Ruby-Cream", forme: "Flower", color: "Pink" },
	alcremierubycreamribbon: { isCosmeticForme: true, name: "Alcremie-Ruby-Cream-Ribbon", baseSpecies: "Alcremie-Ruby-Cream", forme: "Ribbon", color: "Pink" },

	alcremiematchacream: {
		inherit: true,
		cosmeticFormes: [
			"Alcremie-Matcha-Cream-Berry", "Alcremie-Matcha-Cream-Love", "Alcremie-Matcha-Cream-Star",
			"Alcremie-Matcha-Cream-Clover", "Alcremie-Matcha-Cream-Flower", "Alcremie-Matcha-Cream-Ribbon",
		],
	},
	alcremiematchacreamberry:  { isCosmeticForme: true, name: "Alcremie-Matcha-Cream-Berry",  baseSpecies: "Alcremie-Matcha-Cream", forme: "Berry",  color: "Green" },
	alcremiematchacreamlove:   { isCosmeticForme: true, name: "Alcremie-Matcha-Cream-Love",   baseSpecies: "Alcremie-Matcha-Cream", forme: "Love",   color: "Green" },
	alcremiematchacreamstar:   { isCosmeticForme: true, name: "Alcremie-Matcha-Cream-Star",   baseSpecies: "Alcremie-Matcha-Cream", forme: "Star",   color: "Green" },
	alcremiematchacreamclover: { isCosmeticForme: true, name: "Alcremie-Matcha-Cream-Clover", baseSpecies: "Alcremie-Matcha-Cream", forme: "Clover", color: "Green" },
	alcremiematchacreamflower: { isCosmeticForme: true, name: "Alcremie-Matcha-Cream-Flower", baseSpecies: "Alcremie-Matcha-Cream", forme: "Flower", color: "Green" },
	alcremiematchacreamribbon: { isCosmeticForme: true, name: "Alcremie-Matcha-Cream-Ribbon", baseSpecies: "Alcremie-Matcha-Cream", forme: "Ribbon", color: "Green" },

	alcremiemintcream: {
		inherit: true,
		cosmeticFormes: [
			"Alcremie-Mint-Cream-Berry", "Alcremie-Mint-Cream-Love", "Alcremie-Mint-Cream-Star",
			"Alcremie-Mint-Cream-Clover", "Alcremie-Mint-Cream-Flower", "Alcremie-Mint-Cream-Ribbon",
		],
	},
	alcremiemintcreamberry:  { isCosmeticForme: true, name: "Alcremie-Mint-Cream-Berry",  baseSpecies: "Alcremie-Mint-Cream", forme: "Berry",  color: "Blue" },
	alcremiemintcreamlove:   { isCosmeticForme: true, name: "Alcremie-Mint-Cream-Love",   baseSpecies: "Alcremie-Mint-Cream", forme: "Love",   color: "Blue" },
	alcremiemintcreamstar:   { isCosmeticForme: true, name: "Alcremie-Mint-Cream-Star",   baseSpecies: "Alcremie-Mint-Cream", forme: "Star",   color: "Blue" },
	alcremiemintcreamclover: { isCosmeticForme: true, name: "Alcremie-Mint-Cream-Clover", baseSpecies: "Alcremie-Mint-Cream", forme: "Clover", color: "Blue" },
	alcremiemintcreamflower: { isCosmeticForme: true, name: "Alcremie-Mint-Cream-Flower", baseSpecies: "Alcremie-Mint-Cream", forme: "Flower", color: "Blue" },
	alcremiemintcreamribbon: { isCosmeticForme: true, name: "Alcremie-Mint-Cream-Ribbon", baseSpecies: "Alcremie-Mint-Cream", forme: "Ribbon", color: "Blue" },

	alcremielemoncream: {
		inherit: true,
		cosmeticFormes: [
			"Alcremie-Lemon-Cream-Berry", "Alcremie-Lemon-Cream-Love", "Alcremie-Lemon-Cream-Star",
			"Alcremie-Lemon-Cream-Clover", "Alcremie-Lemon-Cream-Flower", "Alcremie-Lemon-Cream-Ribbon",
		],
	},
	alcremielemoncreamberry:  { isCosmeticForme: true, name: "Alcremie-Lemon-Cream-Berry",  baseSpecies: "Alcremie-Lemon-Cream", forme: "Berry",  color: "Yellow" },
	alcremielemoncreamlove:   { isCosmeticForme: true, name: "Alcremie-Lemon-Cream-Love",   baseSpecies: "Alcremie-Lemon-Cream", forme: "Love",   color: "Yellow" },
	alcremielemoncreamstar:   { isCosmeticForme: true, name: "Alcremie-Lemon-Cream-Star",   baseSpecies: "Alcremie-Lemon-Cream", forme: "Star",   color: "Yellow" },
	alcremielemoncreamclover: { isCosmeticForme: true, name: "Alcremie-Lemon-Cream-Clover", baseSpecies: "Alcremie-Lemon-Cream", forme: "Clover", color: "Yellow" },
	alcremielemoncreamflower: { isCosmeticForme: true, name: "Alcremie-Lemon-Cream-Flower", baseSpecies: "Alcremie-Lemon-Cream", forme: "Flower", color: "Yellow" },
	alcremielemoncreamribbon: { isCosmeticForme: true, name: "Alcremie-Lemon-Cream-Ribbon", baseSpecies: "Alcremie-Lemon-Cream", forme: "Ribbon", color: "Yellow" },

	alcremiesaltedcream: {
		isCosmeticForme: true,
		name: "Alcremie-Salted-Cream",
		baseSpecies: "Alcremie",
		forme: "Salted-Cream",
		color: "White",
		cosmeticFormes: [
			"Alcremie-Salted-Cream-Berry", "Alcremie-Salted-Cream-Love", "Alcremie-Salted-Cream-Star",
			"Alcremie-Salted-Cream-Clover", "Alcremie-Salted-Cream-Flower", "Alcremie-Salted-Cream-Ribbon",
		],
	},
	alcremiesaltedcreamberry:  { isCosmeticForme: true, name: "Alcremie-Salted-Cream-Berry",  baseSpecies: "Alcremie-Salted-Cream", forme: "Berry",  color: "White" },
	alcremiesaltedcreamlove:   { isCosmeticForme: true, name: "Alcremie-Salted-Cream-Love",   baseSpecies: "Alcremie-Salted-Cream", forme: "Love",   color: "White" },
	alcremiesaltedcreamstar:   { isCosmeticForme: true, name: "Alcremie-Salted-Cream-Star",   baseSpecies: "Alcremie-Salted-Cream", forme: "Star",   color: "White" },
	alcremiesaltedcreamclover: { isCosmeticForme: true, name: "Alcremie-Salted-Cream-Clover", baseSpecies: "Alcremie-Salted-Cream", forme: "Clover", color: "White" },
	alcremiesaltedcreamflower: { isCosmeticForme: true, name: "Alcremie-Salted-Cream-Flower", baseSpecies: "Alcremie-Salted-Cream", forme: "Flower", color: "White" },
	alcremiesaltedcreamribbon: { isCosmeticForme: true, name: "Alcremie-Salted-Cream-Ribbon", baseSpecies: "Alcremie-Salted-Cream", forme: "Ribbon", color: "White" },

	alcremierubyswirl: {
		inherit: true,
		cosmeticFormes: [
			"Alcremie-Ruby-Swirl-Berry", "Alcremie-Ruby-Swirl-Love", "Alcremie-Ruby-Swirl-Star",
			"Alcremie-Ruby-Swirl-Clover", "Alcremie-Ruby-Swirl-Flower", "Alcremie-Ruby-Swirl-Ribbon",
		],
	},
	alcremierubyswirlberry:  { isCosmeticForme: true, name: "Alcremie-Ruby-Swirl-Berry",  baseSpecies: "Alcremie-Ruby-Swirl", forme: "Berry",  color: "Yellow" },
	alcremierubyswirlove:    { isCosmeticForme: true, name: "Alcremie-Ruby-Swirl-Love",   baseSpecies: "Alcremie-Ruby-Swirl", forme: "Love",   color: "Yellow" },
	alcremierubyswirlstar:   { isCosmeticForme: true, name: "Alcremie-Ruby-Swirl-Star",   baseSpecies: "Alcremie-Ruby-Swirl", forme: "Star",   color: "Yellow" },
	alcremierubyswirlclover: { isCosmeticForme: true, name: "Alcremie-Ruby-Swirl-Clover", baseSpecies: "Alcremie-Ruby-Swirl", forme: "Clover", color: "Yellow" },
	alcremierubyswirlflower: { isCosmeticForme: true, name: "Alcremie-Ruby-Swirl-Flower", baseSpecies: "Alcremie-Ruby-Swirl", forme: "Flower", color: "Yellow" },
	alcremierubyswirlribbon: { isCosmeticForme: true, name: "Alcremie-Ruby-Swirl-Ribbon", baseSpecies: "Alcremie-Ruby-Swirl", forme: "Ribbon", color: "Yellow" },

	alcremiecaramelswirl: {
		inherit: true,
		cosmeticFormes: [
			"Alcremie-Caramel-Swirl-Berry", "Alcremie-Caramel-Swirl-Love", "Alcremie-Caramel-Swirl-Star",
			"Alcremie-Caramel-Swirl-Clover", "Alcremie-Caramel-Swirl-Flower", "Alcremie-Caramel-Swirl-Ribbon",
		],
	},
	alcremiecaramelswirlberry:  { isCosmeticForme: true, name: "Alcremie-Caramel-Swirl-Berry",  baseSpecies: "Alcremie-Caramel-Swirl", forme: "Berry",  color: "Yellow" },
	alcremiecaramelswirlove:    { isCosmeticForme: true, name: "Alcremie-Caramel-Swirl-Love",   baseSpecies: "Alcremie-Caramel-Swirl", forme: "Love",   color: "Yellow" },
	alcremiecaramelswirlstar:   { isCosmeticForme: true, name: "Alcremie-Caramel-Swirl-Star",   baseSpecies: "Alcremie-Caramel-Swirl", forme: "Star",   color: "Yellow" },
	alcremiecaramelswirlclover: { isCosmeticForme: true, name: "Alcremie-Caramel-Swirl-Clover", baseSpecies: "Alcremie-Caramel-Swirl", forme: "Clover", color: "Yellow" },
	alcremiecaramelswirlflower: { isCosmeticForme: true, name: "Alcremie-Caramel-Swirl-Flower", baseSpecies: "Alcremie-Caramel-Swirl", forme: "Flower", color: "Yellow" },
	alcremiecaramelswirlribbon: { isCosmeticForme: true, name: "Alcremie-Caramel-Swirl-Ribbon", baseSpecies: "Alcremie-Caramel-Swirl", forme: "Ribbon", color: "Yellow" },

	alcremierainbowswirl: {
		inherit: true,
		cosmeticFormes: [
			"Alcremie-Rainbow-Swirl-Berry", "Alcremie-Rainbow-Swirl-Love", "Alcremie-Rainbow-Swirl-Star",
			"Alcremie-Rainbow-Swirl-Clover", "Alcremie-Rainbow-Swirl-Flower", "Alcremie-Rainbow-Swirl-Ribbon",
		],
	},
	alcremierainbowswirlberry:  { isCosmeticForme: true, name: "Alcremie-Rainbow-Swirl-Berry",  baseSpecies: "Alcremie-Rainbow-Swirl", forme: "Berry",  color: "Yellow" },
	alcremierainbowswirlove:    { isCosmeticForme: true, name: "Alcremie-Rainbow-Swirl-Love",   baseSpecies: "Alcremie-Rainbow-Swirl", forme: "Love",   color: "Yellow" },
	alcremierainbowswirlstar:   { isCosmeticForme: true, name: "Alcremie-Rainbow-Swirl-Star",   baseSpecies: "Alcremie-Rainbow-Swirl", forme: "Star",   color: "Yellow" },
	alcremierainbowswirlclover: { isCosmeticForme: true, name: "Alcremie-Rainbow-Swirl-Clover", baseSpecies: "Alcremie-Rainbow-Swirl", forme: "Clover", color: "Yellow" },
	alcremierainbowswirlflower: { isCosmeticForme: true, name: "Alcremie-Rainbow-Swirl-Flower", baseSpecies: "Alcremie-Rainbow-Swirl", forme: "Flower", color: "Yellow" },
	alcremierainbowswirlribbon: { isCosmeticForme: true, name: "Alcremie-Rainbow-Swirl-Ribbon", baseSpecies: "Alcremie-Rainbow-Swirl", forme: "Ribbon", color: "Yellow" },

	// --- Smeargle color cosmetic formes ---
	smeargle: {
		inherit: true,
		cosmeticFormes: [
			"Smeargle-Black", "Smeargle-White", "Smeargle-Red", "Smeargle-Green",
			"Smeargle-Yellow", "Smeargle-Blue", "Smeargle-Brown", "Smeargle-Orange",
			"Smeargle-Pink", "Smeargle-Purple",
		],
	},
	smeargleblack: { isCosmeticForme: true, name: "Smeargle-Black", baseSpecies: "Smeargle", forme: "Black", color: "Black" },
	smearglewhite: { isCosmeticForme: true, name: "Smeargle-White", baseSpecies: "Smeargle", forme: "White", color: "White" },
	smearglered: { isCosmeticForme: true, name: "Smeargle-Red", baseSpecies: "Smeargle", forme: "Red", color: "Red" },
	smearglegreen: { isCosmeticForme: true, name: "Smeargle-Green", baseSpecies: "Smeargle", forme: "Green", color: "Green" },
	smeargleyellow: { isCosmeticForme: true, name: "Smeargle-Yellow", baseSpecies: "Smeargle", forme: "Yellow", color: "Yellow" },
	smeargleblue: { isCosmeticForme: true, name: "Smeargle-Blue", baseSpecies: "Smeargle", forme: "Blue", color: "Blue" },
	smearglebrown: { isCosmeticForme: true, name: "Smeargle-Brown", baseSpecies: "Smeargle", forme: "Brown", color: "Brown" },
	smeargleorange: { isCosmeticForme: true, name: "Smeargle-Orange", baseSpecies: "Smeargle", forme: "Orange", color: "Red" },
	smearglepink: { isCosmeticForme: true, name: "Smeargle-Pink", baseSpecies: "Smeargle", forme: "Pink", color: "Pink" },
	smearglepurple: { isCosmeticForme: true, name: "Smeargle-Purple", baseSpecies: "Smeargle", forme: "Purple", color: "Purple" },

	// --- Minior: colored meteor formes so each core colour has its own meteor sprite ---
	// Game files auto-extract meteor forms with IDs like miniorbluemeteor, miniorgreenmeteor, etc.
	// The base Minior entry configures forme lists; apply battleOnly metadata to auto-extracted entries.
	minior: {
		inherit: true,
		cosmeticFormes: ["Minior-Orange", "Minior-Yellow", "Minior-Green", "Minior-Blue", "Minior-Indigo", "Minior-Violet"],
		otherFormes: [
			"Minior-Meteor",
			"Minior-Blue Meteor", "Minior-Yellow Meteor", "Minior-Green Meteor",
			"Minior-Indigo Meteor", "Minior-Orange Meteor", "Minior-Violet Meteor",
		],
	},
	// Game-file-extracted Minior meteor forms: add battleOnly metadata.
	miniorbluemeteor: {
		battleOnly: "Minior-Blue",
	},
	miniorgreenmeteor: {
		battleOnly: "Minior-Green",
	},
	miniorindigometeor: {
		battleOnly: "Minior-Indigo",
	},
	miniororangemeteor: {
		battleOnly: "Minior-Orange",
	},
	minioryellowmeteor: {
		battleOnly: "Minior-Yellow",
	},
	miniorvioletmeteor: {
		battleOnly: "Minior-Violet",
	},
};

module.exports = {
	FORM_NUMBER_SPECIES_OVERRIDES,
	CUSTOM_FORM_BASE_SPECIES_EXCEPTIONS,
	MANUAL_LEARNSET_OVERRIDES,
	MANUAL_POKEDEX_OVERRIDES,
};
