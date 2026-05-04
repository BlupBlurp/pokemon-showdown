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
