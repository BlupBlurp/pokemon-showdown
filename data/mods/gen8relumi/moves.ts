export const Moves: import("../../../sim/dex-moves").ModdedMoveDataTable = {
	aeroblast: {
		accuracy: 100,
		inherit: true,
	},
	aircutter: {
		accuracy: 100,
		inherit: true,
	},
	airslash: {
		accuracy: 100,
		inherit: true,
	},
	aquatail: {
		accuracy: 100,
		inherit: true,
	},
	armorcannon: {
		basePower: 100,
		flags: {
			metronome: 1,
			mirror: 1,
			protect: 1,
			pulse: 1,
		},
		inherit: true,
	},
	armthrust: {
		basePower: 25,
		inherit: true,
	},
	aurorabeam: {
		basePower: 75,
		inherit: true,
		pp: 15,
	},
	beatup: {
		inherit: true,
		multihit: 6,
	},
	bitterblade: {
		category: "Status",
		inherit: true,
	},
	blazekick: {
		accuracy: 100,
		basePower: 90,
		inherit: true,
	},
	blazingtorque: {
		category: "Status",
		flags: {
			contact: 1,
			failcopycat: 1,
			failencore: 1,
			failinstruct: 1,
			failmefirst: 1,
			failmimic: 1,
			metronome: 1,
			mirror: 1,
			noassist: 1,
			nosketch: 1,
			nosleeptalk: 1,
			protect: 1,
		},
		inherit: true,
	},
	bonemerang: {
		accuracy: 100,
		inherit: true,
	},
	bonerush: {
		accuracy: 100,
		inherit: true,
	},
	bubblebeam: {
		basePower: 75,
		inherit: true,
		pp: 15,
	},
	burningjealousy: {
		inherit: true,
		secondary: {
			chance: 100,
			status: "brn",
		},
	},
	chargebeam: {
		accuracy: 100,
		inherit: true,
	},
	chatter: {
		basePower: 90,
		inherit: true,
		pp: 15,
	},
	chillingwater: {
		category: "Physical",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	chillyreception: {
		category: "Special",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		gen: 8,
		inherit: true,
		isNonstandard: null,
	},
	chloroblast: {
		accuracy: 100,
		inherit: true,
	},
	collisioncourse: {
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	combattorque: {
		flags: {
			contact: 1,
			failcopycat: 1,
			failencore: 1,
			failinstruct: 1,
			failmefirst: 1,
			failmimic: 1,
			metronome: 1,
			mirror: 1,
			noassist: 1,
			nosketch: 1,
			nosleeptalk: 1,
			protect: 1,
		},
		inherit: true,
	},
	comeuppance: {
		category: "Status",
		flags: {
			contact: 1,
			failmefirst: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	covet: {
		inherit: true,
		type: "Fairy",
	},
	crabhammer: {
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
			punch: 1,
		},
		inherit: true,
	},
	crosspoison: {
		basePower: 90,
		inherit: true,
		pp: 15,
	},
	crushclaw: {
		accuracy: 100,
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
			slicing: 1,
		},
		inherit: true,
	},
	cut: {
		accuracy: 100,
		basePower: 60,
		critRatio: 2,
		inherit: true,
		pp: 25,
		shortDesc: "High critical hit ratio.",
		type: "Grass",
	},
	darkvoid: {
		accuracy: 80,
		inherit: true,
	},
	direclaw: {
		accuracy: 80,
		desc: "Has a 30% chance to cause the target to either fall asleep, become poisoned, or become paralyzed.",
		inherit: true,
		secondary: {
			chance: 30,
			onHit: function onHit(target, source) {
				const status = this.sample(['psn', 'par', 'slp']);
				target.trySetStatus(status, source);
			},
		},
		shortDesc: "30% chance to sleep, poison, or paralyze target.",
	},
	doodle: {
		category: "Special",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	doublehit: {
		accuracy: 100,
		basePower: 40,
		inherit: true,
	},
	doubleironbash: {
		basePower: 50,
		inherit: true,
	},
	doubleshock: {
		category: "Status",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	doubleslap: {
		accuracy: 100,
		inherit: true,
		type: "Fairy",
	},
	dracometeor: {
		accuracy: 100,
		inherit: true,
	},
	dragonclaw: {
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
			slicing: 1,
		},
		inherit: true,
	},
	dragonhammer: {
		basePower: 120,
		desc: "If the target lost HP, the user takes recoil damage equal to 1/3 the HP lost by the target, rounded half up, but not less than 1 HP.",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
		recoil: [
			33,
			100,
		],
		shortDesc: "Has 33% recoil.",
	},
	dragonrush: {
		accuracy: 85,
		inherit: true,
	},
	dualchop: {
		accuracy: 100,
		inherit: true,
	},
	dualwingbeat: {
		accuracy: 100,
		inherit: true,
	},
	electrodrift: {
		category: "Physical",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	electroshot: {
		inherit: true,
		self: {
			boosts: {
				spa: 1,
			},
		},
	},
	filletaway: {
		category: "Special",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
			snatch: 1,
		},
		inherit: true,
	},
	firefang: {
		accuracy: 100,
		inherit: true,
	},
	firstimpression: {
		basePower: 100,
		inherit: true,
	},
	flamewheel: {
		basePower: 75,
		inherit: true,
		pp: 15,
	},
	flashcannon: {
		flags: {
			metronome: 1,
			mirror: 1,
			protect: 1,
			pulse: 1,
		},
		inherit: true,
	},
	fleurcannon: {
		accuracy: 100,
		inherit: true,
	},
	fly: {
		accuracy: 100,
		basePower: 100,
		inherit: true,
	},
	freezeshock: {
		desc: "Has a 30% chance to paralyze the target. This attack charges on the first turn and executes on the second. Raises the user's Attack by 1 stage on the first turn. If the user is holding a Power Herb, the move completes in one turn.",
		inherit: true,
		onTryMove: function onTryMove(attacker, defender, move) {
			if (attacker.removeVolatile(move.id)) {
				return;
			}
			this.add('-prepare', attacker, move.name);
			this.boost({ atk: 1 }, attacker, attacker, move);
			if (!this.runEvent('ChargeMove', attacker, defender, move)) {
				return;
			}
			attacker.addVolatile('twoturnmove', defender);
			return null;
		},
		prepare: "  [POKEMON] became cloaked in a freezing light!",
		shortDesc: "Raises Atk by 1 on turn 1. Hits turn 2. 30% paralyze.",
	},
	furyattack: {
		accuracy: 100,
		basePower: 20,
		inherit: true,
	},
	geargrind: {
		accuracy: 100,
		inherit: true,
	},
	gigatonhammer: {
		category: "Status",
		flags: {
			cantusetwice: 1,
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	glaciallance: {
		basePower: 120,
		inherit: true,
	},
	glaiverush: {
		category: "Status",
		inherit: true,
	},
	gravapple: {
		basePower: 90,
		inherit: true,
	},
	gunkshot: {
		accuracy: 85,
		inherit: true,
	},
	hail: {
		inherit: true,
		name: "Snowscape",
		shortDesc: "For 5 turns, snow begins to fall.",
		weather: "snowscape",
	},
	heartstamp: {
		basePower: 75,
		inherit: true,
		type: "Fairy",
	},
	holdback: {
		inherit: true,
		type: "Fighting",
	},
	hydropump: {
		accuracy: 85,
		inherit: true,
	},
	hydrosteam: {
		category: "Physical",
		flags: {
			contact: 1,
			defrost: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	hyperdrill: {
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
		},
		inherit: true,
	},
	hyperfang: {
		accuracy: 100,
		inherit: true,
	},
	iceburn: {
		desc: "Has a 30% chance to burn the target. This attack charges on the first turn and executes on the second. Raises the user's Special Attack by 1 stage on the first turn. If the user is holding a Power Herb, the move completes in one turn.",
		inherit: true,
		onTryMove: function onTryMove(attacker, defender, move) {
			if (attacker.removeVolatile(move.id)) {
				return;
			}
			this.add('-prepare', attacker, move.name);
			this.boost({ spa: 1 }, attacker, attacker, move);
			if (!this.runEvent('ChargeMove', attacker, defender, move)) {
				return;
			}
			attacker.addVolatile('twoturnmove', defender);
			return null;
		},
		prepare: "  [POKEMON] became cloaked in freezing air!",
		shortDesc: "Raises Sp. Atk by 1 on turn 1. Hits turn 2. 30% burn.",
	},
	icefang: {
		accuracy: 100,
		inherit: true,
	},
	icespinner: {
		category: "Status",
		inherit: true,
	},
	iciclecrash: {
		accuracy: 100,
		inherit: true,
	},
	irontail: {
		accuracy: 85,
		inherit: true,
	},
	ivycudgel: {
		category: "Status",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	jawlock: {
		inherit: true,
		type: "Water",
	},
	jetpunch: {
		category: "Status",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
			punch: 1,
		},
		inherit: true,
		priority: 0,
	},
	lastrespects: {
		basePower: 30,
		basePowerCallback: function basePowerCallback(pokemon, target, move) {
			return 50 + 30 * pokemon.side.totalFainted;
		},
		category: "Physical",
		desc: "Power is equal to 50+(X*30), where X is the total number of times any Pokemon has fainted on the user's side, and X cannot be greater than 100.",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
		shortDesc: "+30 power for each time a party member fainted.",
	},
	leafstorm: {
		accuracy: 100,
		inherit: true,
	},
	luminacrash: {
		category: "Physical",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	lusterpurge: {
		basePower: 95,
		inherit: true,
	},
	magicaltorque: {
		category: "Status",
		flags: {
			contact: 1,
			failcopycat: 1,
			failencore: 1,
			failinstruct: 1,
			failmefirst: 1,
			failmimic: 1,
			metronome: 1,
			mirror: 1,
			noassist: 1,
			nosketch: 1,
			nosleeptalk: 1,
			protect: 1,
		},
		inherit: true,
	},
	makeitrain: {
		category: "Physical",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	matchagotcha: {
		category: "Physical",
		flags: {
			contact: 1,
			defrost: 1,
			heal: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	maxhailstorm: {
		inherit: true,
		weather: "snowscape",
	},
	megadrain: {
		basePower: 60,
		inherit: true,
	},
	megakick: {
		accuracy: 85,
		inherit: true,
	},
	megapunch: {
		accuracy: 100,
		inherit: true,
	},
	metalclaw: {
		accuracy: 100,
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
			slicing: 1,
		},
		inherit: true,
	},
	milkdrink: {
		inherit: true,
		pp: 5,
	},
	mirrorshot: {
		desc: "Has a 30% chance to lower the target's speed by 1 stage.",
		inherit: true,
		secondary: {
			boosts: {
				spe: -1,
			},
			chance: 30,
		},
		shortDesc: "30% chance to lower the target's speed by 1.",
	},
	mistball: {
		basePower: 95,
		inherit: true,
	},
	mortalspin: {
		category: "Status",
		inherit: true,
	},
	mudbomb: {
		desc: "Has a 30% chance to lower the target's speed by 1 stage.",
		inherit: true,
		secondary: {
			boosts: {
				spe: -1,
			},
			chance: 30,
		},
		shortDesc: "30% chance to lower the target's speed by 1.",
	},
	muddywater: {
		desc: "Has a 30% chance to lower the target's speed by 1 stage.",
		inherit: true,
		secondary: {
			boosts: {
				spe: -1,
			},
			chance: 30,
		},
		shortDesc: "30% chance to lower the foe(s) speed by 1.",
	},
	mudslap: {
		desc: "Has a 100% chance to lower the target's speed by 2 stages.",
		inherit: true,
		secondary: {
			boosts: {
				spe: -2,
			},
			chance: 100,
		},
		shortDesc: "100% chance to lower the target's speed by 2.",
	},
	needlearm: {
		basePower: 90,
		inherit: true,
	},
	nightdaze: {
		accuracy: 100,
		inherit: true,
	},
	noxioustorque: {
		category: "Status",
		flags: {
			contact: 1,
			failcopycat: 1,
			failencore: 1,
			failinstruct: 1,
			failmefirst: 1,
			failmimic: 1,
			metronome: 1,
			mirror: 1,
			noassist: 1,
			nosketch: 1,
			nosleeptalk: 1,
			protect: 1,
		},
		inherit: true,
	},
	orderup: {
		category: "Status",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	overheat: {
		accuracy: 100,
		inherit: true,
	},
	paraboliccharge: {
		basePower: 75,
		inherit: true,
	},
	pinmissile: {
		accuracy: 100,
		inherit: true,
	},
	playrough: {
		accuracy: 100,
		inherit: true,
	},
	poisonfang: {
		basePower: 65,
		inherit: true,
	},
	poisontail: {
		basePower: 90,
		inherit: true,
		pp: 15,
	},
	populationbomb: {
		category: "Status",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
			slicing: 1,
		},
		inherit: true,
	},
	pounce: {
		category: "Status",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	powergem: {
		basePower: 90,
		inherit: true,
	},
	powershift: {
		flags: {
			metronome: 1,
			mirror: 1,
			snatch: 1,
		},
		inherit: true,
	},
	protect: {
		inherit: true,
		pp: 5,
	},
	psyblade: {
		category: "Status",
		inherit: true,
	},
	psychicnoise: {
		flags: {
			bypasssub: 1,
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
			sound: 1,
		},
		inherit: true,
	},
	ragefist: {
		basePowerCallback: function basePowerCallback(pokemon) {
			return Math.min(200, 50 + 25 * pokemon.timesAttacked);
		},
		desc: "Power is equal to 50+(X*25), where X is the total number of times the user has been hit by a damaging attack during the battle, even if the user did not lose HP from the attack. X cannot be greater than 6 and does not reset upon switching out or fainting. Each hit of a multi-hit attack is counted, but confusion damage is not counted.",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
			punch: 1,
		},
		inherit: true,
		shortDesc: "+25 power for each time user was hit. Max 6 hits.",
	},
	ragingbull: {
		category: "Status",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	ragingfury: {
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	recover: {
		inherit: true,
		pp: 5,
	},
	rest: {
		inherit: true,
		pp: 5,
	},
	return: {
		basePower: 70,
		inherit: true,
	},
	revivalblessing: {
		category: "Special",
		flags: {
			contact: 1,
			heal: 1,
			metronome: 1,
			mirror: 1,
			nosketch: 1,
			protect: 1,
		},
		inherit: true,
	},
	rockblast: {
		accuracy: 100,
		inherit: true,
	},
	rockclimb: {
		accuracy: 100,
		desc: "Has a 10% chance to confuse the target.",
		inherit: true,
		pp: 10,
		secondary: {
			chance: 10,
			volatileStatus: "confusion",
		},
		shortDesc: "10% chance to confuse the target.",
		type: "Rock",
	},
	rocksmash: {
		basePower: 60,
		inherit: true,
	},
	rockthrow: {
		accuracy: 100,
		inherit: true,
	},
	rocktomb: {
		accuracy: 100,
		inherit: true,
	},
	roost: {
		inherit: true,
		pp: 5,
	},
	ruination: {
		category: "Physical",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	saltcure: {
		category: "Status",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	scaleshot: {
		accuracy: 100,
		inherit: true,
	},
	shadowclaw: {
		basePower: 80,
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
			slicing: 1,
		},
		inherit: true,
	},
	shadowpunch: {
		basePower: 80,
		inherit: true,
		pp: 15,
	},
	shedtail: {
		category: "Special",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	shoreup: {
		inherit: true,
		pp: 5,
	},
	silktrap: {
		category: "Special",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
		priority: 0,
	},
	slackoff: {
		inherit: true,
		pp: 5,
	},
	sludge: {
		basePower: 75,
		inherit: true,
		pp: 15,
	},
	smartstrike: {
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
			slicing: 1,
		},
		inherit: true,
	},
	snaptrap: {
		accuracy: 75,
		basePower: 100,
		inherit: true,
		type: "Steel",
	},
	snowscape: {
		category: "Special",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		gen: 8,
		inherit: true,
		isNonstandard: null,
	},
	softboiled: {
		inherit: true,
		pp: 5,
	},
	spicyextract: {
		category: "Special",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
			reflectable: 1,
		},
		inherit: true,
	},
	spinout: {
		category: "Status",
		inherit: true,
	},
	springtidestorm: {
		flags: {
			metronome: 1,
			mirror: 1,
			protect: 1,
			wind: 1,
		},
		inherit: true,
	},
	steameruption: {
		accuracy: 100,
		inherit: true,
	},
	steelbeam: {
		flags: {
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	steelwing: {
		accuracy: 100,
		inherit: true,
	},
	stoneedge: {
		accuracy: 90,
		inherit: true,
	},
	strength: {
		basePower: 100,
		inherit: true,
	},
	submission: {
		accuracy: 100,
		basePower: 110,
		desc: "If the target lost HP, the user takes recoil damage equal to 1/3 the HP lost by the target, rounded half up, but not less than 1 HP.",
		inherit: true,
		recoil: [
			33,
			100,
		],
		shortDesc: "Has 1/3 recoil.",
	},
	supercellslam: {
		basePower: 130,
		inherit: true,
	},
	syrupbomb: {
		category: "Physical",
		flags: {
			bullet: 1,
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	tailslap: {
		accuracy: 100,
		inherit: true,
	},
	takedown: {
		accuracy: 100,
		inherit: true,
	},
	terablast: {
		category: "Physical",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			mustpressure: 1,
			protect: 1,
		},
		inherit: true,
	},
	thunderfang: {
		accuracy: 100,
		inherit: true,
	},
	tidyup: {
		category: "Special",
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	trailblaze: {
		flags: {
			contact: 1,
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	triplearrows: {
		category: "Special",
		inherit: true,
		secondaries: [
			{
				boosts: {
					spd: -1,
				},
				chance: 50,
			},
			{
				chance: 30,
				volatileStatus: "flinch",
			},
		],
		shortDesc: "High crit. Target: 50% -1 Sp. Defense, 30% flinch.",
	},
	tripledive: {
		category: "Status",
		inherit: true,
	},
	twinbeam: {
		flags: {
			metronome: 1,
			mirror: 1,
			protect: 1,
		},
		inherit: true,
	},
	veeveevolley: {
		basePower: 70,
		inherit: true,
	},
	waterpulse: {
		basePower: 70,
		inherit: true,
	},
	wickedtorque: {
		category: "Status",
		flags: {
			contact: 1,
			failcopycat: 1,
			failencore: 1,
			failinstruct: 1,
			failmefirst: 1,
			failmimic: 1,
			metronome: 1,
			mirror: 1,
			noassist: 1,
			nosketch: 1,
			nosleeptalk: 1,
			protect: 1,
		},
		inherit: true,
	},
	wildcharge: {
		basePower: 100,
		inherit: true,
	},
	zenheadbutt: {
		accuracy: 100,
		inherit: true,
	},
};
