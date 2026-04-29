"use strict";

// Manual and hardcoded move overrides that should persist across sync runs.
const MANUAL_MOVE_OVERRIDES = {
	hail: {
		name: "Snowscape",
		shortDesc: "For 5 turns, snow begins to fall.",
		weather: "snowscape",
	},
	maxhailstorm: {
		weather: "snowscape",
	},
	snowscape: {
		gen: 8,
		isNonstandard: null,
	},
	chillyreception: {
		gen: 8,
		isNonstandard: null,
	},
	direclaw: {
		secondary: {
			chance: 30,
			onHit(target, source) {
				const status = this.sample(['psn', 'par', 'slp']);
				target.trySetStatus(status, source);
			},
		},
		desc: "Has a 30% chance to cause the target to either fall asleep, become poisoned, or become paralyzed.",
		shortDesc: "30% chance to sleep, poison, or paralyze target.",
	},
	ragefist: {
		basePowerCallback(pokemon) {
			return Math.min(200, 50 + 25 * pokemon.timesAttacked);
		},
		desc: "Power is equal to 50+(X*25), where X is the total number of times the user has been hit by a damaging attack during the battle, even if the user did not lose HP from the attack. X cannot be greater than 6 and does not reset upon switching out or fainting. Each hit of a multi-hit attack is counted, but confusion damage is not counted.",
		shortDesc: "+25 power for each time user was hit. Max 6 hits.",
	},
	lastrespects: {
		basePowerCallback(pokemon, target, move) {
			return 50 + 30 * pokemon.side.totalFainted;
		},
		desc: "Power is equal to 50+(X*30), where X is the total number of times any Pokemon has fainted on the user's side, and X cannot be greater than 100.",
		shortDesc: "+30 power for each time a party member fainted.",
	},
	iceburn: {
		onTryMove(attacker, defender, move) {
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
		desc: "Has a 30% chance to burn the target. This attack charges on the first turn and executes on the second. Raises the user's Special Attack by 1 stage on the first turn. If the user is holding a Power Herb, the move completes in one turn.",
		shortDesc: "Raises Sp. Atk by 1 on turn 1. Hits turn 2. 30% burn.",

		prepare: "  [POKEMON] became cloaked in freezing air!",
	},
	freezeshock: {
		onTryMove(attacker, defender, move) {
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
		desc: "Has a 30% chance to paralyze the target. This attack charges on the first turn and executes on the second. Raises the user's Attack by 1 stage on the first turn. If the user is holding a Power Herb, the move completes in one turn.",
		shortDesc: "Raises Atk by 1 on turn 1. Hits turn 2. 30% paralyze.",

		prepare: "  [POKEMON] became cloaked in a freezing light!",
	},
	triplearrows: {
		shortDesc: "High crit. Target: 50% -1 Sp. Defense, 30% flinch.",
	},
	cut: {
		shortDesc: "High critical hit ratio.",
	},
	dragonhammer: {
		desc: "If the target lost HP, the user takes recoil damage equal to 1/3 the HP lost by the target, rounded half up, but not less than 1 HP.",
		shortDesc: "Has 33% recoil.",
	},
	mirrorshot: {
		desc: "Has a 30% chance to lower the target's speed by 1 stage.",
		shortDesc: "30% chance to lower the target's speed by 1.",
	},
	mudbomb: {
		desc: "Has a 30% chance to lower the target's speed by 1 stage.",
		shortDesc: "30% chance to lower the target's speed by 1.",
	},
	muddywater: {
		desc: "Has a 30% chance to lower the target's speed by 1 stage.",
		shortDesc: "30% chance to lower the foe(s) speed by 1.",
	},
	mudslap: {
		desc: "Has a 100% chance to lower the target's speed by 2 stages.",
		shortDesc: "100% chance to lower the target's speed by 2.",
	},
	rockclimb: {
		desc: "Has a 10% chance to confuse the target.",
		shortDesc: "10% chance to confuse the target.",
	},
	submission: {
		desc: "If the target lost HP, the user takes recoil damage equal to 1/3 the HP lost by the target, rounded half up, but not less than 1 HP.",
		shortDesc: "Has 1/3 recoil.",
	},
};

module.exports = { MANUAL_MOVE_OVERRIDES };
