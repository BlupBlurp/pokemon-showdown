export const Abilities: import("../../../sim/dex-abilities").ModdedAbilityDataTable =
	{
		sharpness: {
			inherit: true,
			onBasePower(basePower, attacker, defender, move) {
				// Slicing moves + new moves
				if (
					move.flags["slicing"] ||
					[
						"smartstrike",
						"shadowclaw",
						"dragonclaw",
						"metalclaw",
						"crushclaw",
					].includes(move.id)
				) {
					this.debug("Sharpness boost");
					return this.chainModify(1.5);
				}
			},
		},
		megalauncher: {
			inherit: true,
			onBasePower(basePower, attacker, defender, move) {
				// Pulse moves + new moves
				if (
					move.flags["pulse"] ||
					["flashcannon", "armorcannon"].includes(move.id)
				) {
					return this.chainModify(1.5);
				}
			},
		},
		ironfist: {
			inherit: true,
			onBasePowerPriority: 23,
			onBasePower(basePower, attacker, defender, move) {
				if (move.flags["punch"]) {
					this.debug("Iron Fist boost");
					return this.chainModify(1.5);
				}
			},
		},
		galewings: {
			inherit: true,
			onModifyPriority(priority, pokemon, target, move) {
				// Priority to all Flying-type moves (gen 6 behavior, no HP requirement)
				if (move?.type === "Flying") return priority + 1;
			},
		},
		runaway: {
			inherit: true,
			onTrapPokemonPriority: -10,
			onTrapPokemon(pokemon) {
				pokemon.trapped = false;
			},
			onMaybeTrapPokemonPriority: -10,
			onMaybeTrapPokemon(pokemon) {
				pokemon.maybeTrapped = false;
			},
		},
		protean: {
			inherit: true,
			onPrepareHit(source, target, move) {
				// Restored gen 8 behavior: no one-time restriction
				if (
					move.hasBounced ||
					move.flags["futuremove"] ||
					move.sourceEffect === "snatch" ||
					move.callsMove
				)
					return;
				const type = move.type;
				if (type && type !== "???" && source.getTypes().join() !== type) {
					if (!source.setType(type)) return;
					this.add(
						"-start",
						source,
						"typechange",
						type,
						"[from] ability: Protean",
					);
				}
			},
		},
		libero: {
			inherit: true,
			onPrepareHit(source, target, move) {
				// Restored gen 8 behavior: no one-time restriction
				if (
					move.hasBounced ||
					move.flags["futuremove"] ||
					move.sourceEffect === "snatch" ||
					move.callsMove
				)
					return;
				const type = move.type;
				if (type && type !== "???" && source.getTypes().join() !== type) {
					if (!source.setType(type)) return;
					this.add(
						"-start",
						source,
						"typechange",
						type,
						"[from] ability: Libero",
					);
				}
			},
		},
		zenmode: {
			inherit: true,
			onSwitchIn(pokemon) {
				// Transform to Zen Mode on switch-in if not already in Zen form
				if (
					pokemon.baseSpecies.baseSpecies !== "Darmanitan" ||
					pokemon.transformed
				) {
					return;
				}
				if (!["Zen", "Galar-Zen"].includes(pokemon.species.forme)) {
					pokemon.addVolatile("zenmode");
				}
			},
			onResidualOrder: 29,
			onResidual(pokemon) {
				if (
					pokemon.baseSpecies.baseSpecies !== "Darmanitan" ||
					pokemon.transformed
				) {
					return;
				}
				// Always in Zen Mode when on field, not just at 50% HP
				if (!["Zen", "Galar-Zen"].includes(pokemon.species.forme)) {
					pokemon.addVolatile("zenmode");
				}
			},
		},
		shieldsdown: {
			inherit: true,
			onStart(pokemon) {
				if (pokemon.baseSpecies.baseSpecies !== 'Minior' || pokemon.transformed) return;
				if (pokemon.hp > pokemon.maxhp / 2) {
					// Transform to meteor forme if not already in any meteor forme.
					if (!pokemon.species.forme.endsWith('Meteor')) {
						const coloredMeteor = 'Minior-' + pokemon.species.forme + ' Meteor';
						const target = this.dex.species.get(coloredMeteor).exists ? coloredMeteor : 'Minior-Meteor';
						pokemon.formeChange(target);
					}
				} else {
					if (pokemon.species.forme.endsWith('Meteor')) {
						pokemon.formeChange(pokemon.set.species);
					}
				}
			},
			onResidualOrder: 29,
			onResidual(pokemon) {
				if (pokemon.baseSpecies.baseSpecies !== 'Minior' || pokemon.transformed || !pokemon.hp) return;
				if (pokemon.hp > pokemon.maxhp / 2) {
					if (!pokemon.species.forme.endsWith('Meteor')) {
						const coloredMeteor = 'Minior-' + pokemon.species.forme + ' Meteor';
						const target = this.dex.species.get(coloredMeteor).exists ? coloredMeteor : 'Minior-Meteor';
						pokemon.formeChange(target);
					}
				} else {
					if (pokemon.species.forme.endsWith('Meteor')) {
						pokemon.formeChange(pokemon.set.species);
					}
				}
			},
			// Match all meteor formes (base + colored) for status immunity.
			onSetStatus(status, target, source, effect) {
				if (!target.species.id.endsWith('meteor') || target.transformed) return;
				if ((effect as Move)?.status) {
					this.add('-immune', target, '[from] ability: Shields Down');
				}
				return false;
			},
			onTryAddVolatile(status, target) {
				if (!target.species.id.endsWith('meteor') || target.transformed) return;
				if (status.id !== 'yawn') return;
				this.add('-immune', target, '[from] ability: Shields Down');
				return null;
			},
		},
	};
