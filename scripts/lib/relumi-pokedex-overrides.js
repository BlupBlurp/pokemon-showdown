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
	150: {
		0: "Mewtwo",
		1: "Mewtwo-Mega-X",
		2: "Mewtwo-Mega-Y",
		3: "Mewtwo-MkII",
		4: "Mewtwo-MkI",
		5: "Mewtwo-Shadow",
		6: "Mewtwo-Mega-Shadow",
	},
	483: {
		2: "Dialga-Primal",
	},
	484: {
		2: "Palkia-Primal",
	},
	492: {
		0: "Shaymin",
		1: "Shaymin-Sky",
		2: "Shaymin-Polluted",
		3: "Shaymin-Sky-Polluted",
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
	718: {
		0: "Zygarde",
		1: "Zygarde-10%",
		2: "Zygarde-10%",
		3: "Zygarde",
		4: "Zygarde-Complete",
		5: "Zygarde-Core",
		6: "Zygarde-Cell",
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

// Cosmetic form generators

function numberedCosmetic(baseId, baseName, count, color, opts) {
	const entries = {};
	const formeNames = [];
	for (let i = 1; i <= count; i++) {
		const forme = "V" + i;
		formeNames.push(baseName + "-" + forme);
		entries[baseId + "v" + i] = {
			isCosmeticForme: true,
			name: baseName + "-" + forme,
			baseSpecies: baseName,
			forme,
			color,
		};
	}
	const base = {};
	if (opts && opts.inherit) base.inherit = true;
	base.cosmeticFormes = formeNames;
	entries[baseId] = base;
	return entries;
}

function labeledCosmetic(baseId, baseName, variants) {
	// variants: [[idSuffix, forme, color], ...]
	const entries = {};
	const formeNames = [];
	for (const [idSuffix, forme, color] of variants) {
		formeNames.push(baseName + "-" + forme);
		entries[baseId + idSuffix] = {
			isCosmeticForme: true,
			name: baseName + "-" + forme,
			baseSpecies: baseName,
			forme,
			color,
		};
	}
	entries[baseId] = { inherit: true, cosmeticFormes: formeNames };
	return entries;
}

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
	miniorbluemeteor: { battleOnly: "Minior-Blue" },
	miniorgreenmeteor: { battleOnly: "Minior-Green" },
	miniorindigometeor: { battleOnly: "Minior-Indigo" },
	miniororangemeteor: { battleOnly: "Minior-Orange" },
	minioryellowmeteor: { battleOnly: "Minior-Yellow" },
	miniorvioletmeteor: { battleOnly: "Minior-Violet" },

	// Vivillon: surface Fancy/Pokeball variants in the cosmetic form picker.
	// Upstream keeps them in otherFormes; the override promotes them to cosmeticFormes
	// alongside the 17 vanilla pattern variants.
	vivillon: {
		cosmeticFormes: [
			"Vivillon-Archipelago", "Vivillon-Continental", "Vivillon-Elegant", "Vivillon-Garden",
			"Vivillon-High Plains", "Vivillon-Icy Snow", "Vivillon-Jungle", "Vivillon-Marine",
			"Vivillon-Modern", "Vivillon-Monsoon", "Vivillon-Ocean", "Vivillon-Polar",
			"Vivillon-River", "Vivillon-Sandstorm", "Vivillon-Savanna", "Vivillon-Sun",
			"Vivillon-Tundra", "Vivillon-Fancy", "Vivillon-Pokeball",
		],
	},
	...numberedCosmetic("arbok", "Arbok", 5, "Purple"),
	...numberedCosmetic("magikarp", "Magikarp", 32, "Red", { inherit: true }),
	...labeledCosmetic("smeargle", "Smeargle", [
		["black", "Black", "Black"],
		["white", "White", "White"],
		["red", "Red", "Red"],
		["green", "Green", "Green"],
		["yellow", "Yellow", "Yellow"],
		["blue", "Blue", "Blue"],
		["brown", "Brown", "Brown"],
		["orange", "Orange", "Red"],
		["pink", "Pink", "Pink"],
		["purple", "Purple", "Purple"],
	]),
	// Alcremie sweet-decoration cosmetic formes
	...buildAlcremieCosmetic(),
};

function buildAlcremieCosmetic() {
	const SWEETS = ["Berry", "Love", "Star", "Clover", "Flower", "Ribbon"];

	const CREAMS = [
		{ id: "rubycream", forme: "Ruby-Cream", color: "Pink", hasFullDef: false },
		{ id: "matchacream", forme: "Matcha-Cream", color: "Green", hasFullDef: false },
		{ id: "mintcream", forme: "Mint-Cream", color: "Blue", hasFullDef: false },
		{ id: "lemoncream", forme: "Lemon-Cream", color: "Yellow", hasFullDef: false },
		{ id: "saltedcream", forme: "Salted-Cream", color: "White", hasFullDef: true },
		{ id: "rubyswirl", forme: "Ruby-Swirl", color: "Yellow", hasFullDef: false },
		{ id: "caramelswirl", forme: "Caramel-Swirl", color: "Yellow", hasFullDef: false },
		{ id: "rainbowswirl", forme: "Rainbow-Swirl", color: "Yellow", hasFullDef: false },
	];

	const entries = {};

	// Base Alcremie sweet variants
	for (const sweet of SWEETS) {
		entries["alcremie" + sweet.toLowerCase()] = {
			isCosmeticForme: true,
			name: "Alcremie-" + sweet,
			baseSpecies: "Alcremie",
			forme: sweet,
			color: "White",
		};
	}

	// Cream forms and their sweet variants
	for (const cream of CREAMS) {
		const creamId = "alcremie" + cream.id;

		const sweetFormes = SWEETS.map(s => "Alcremie-" + cream.forme + "-" + s);

		if (cream.hasFullDef) {
			entries[creamId] = {
				isCosmeticForme: true,
				name: "Alcremie-" + cream.forme,
				baseSpecies: "Alcremie",
				forme: cream.forme,
				color: cream.color,
				cosmeticFormes: sweetFormes,
			};
		} else {
			entries[creamId] = {
				inherit: true,
				cosmeticFormes: sweetFormes,
			};
		}

		for (const sweet of SWEETS) {
			entries[creamId + sweet.toLowerCase()] = {
				isCosmeticForme: true,
				name: "Alcremie-" + cream.forme + "-" + sweet,
				baseSpecies: "Alcremie-" + cream.forme,
				forme: sweet,
				color: cream.color,
			};
		}
	}

	// Base Alcremie entry listing all sweet and cream forme names.
	entries.alcremie = {
		cosmeticFormes: [
			"Alcremie-Berry", "Alcremie-Love", "Alcremie-Star",
			"Alcremie-Clover", "Alcremie-Flower", "Alcremie-Ribbon",
			"Alcremie-Ruby-Cream", "Alcremie-Matcha-Cream", "Alcremie-Mint-Cream",
			"Alcremie-Lemon-Cream", "Alcremie-Salted-Cream", "Alcremie-Ruby-Swirl",
			"Alcremie-Caramel-Swirl", "Alcremie-Rainbow-Swirl",
		],
	};

	return entries;
}

module.exports = {
	FORM_NUMBER_SPECIES_OVERRIDES,
	CUSTOM_FORM_BASE_SPECIES_EXCEPTIONS,
	MANUAL_LEARNSET_OVERRIDES,
	MANUAL_POKEDEX_OVERRIDES,
};
