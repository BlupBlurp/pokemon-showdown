/**
 * Script that compares learnsets between data/mods/gen8relumi/learnsets.ts
 * and data/learnsets.ts to find cases where a Pokemon learns two or more
 * different moves at the same level in gen8relumi.
 *
 * Level 1 is ignored (too many starter-move false positives).
 *
 * Collisions where the same moves also collide in vanilla (gens 9, 8, or 7)
 * are filtered out — they are not unique to Relumi.
 *
 * Results are sorted by number of colliding moves (4+ first, then 3, then 2).
 *
 * For each collision, it shows the full learnset entries for those moves
 * in gens 9, 8, and 7 from the main learnset (TM, egg, tutor, level-up, etc.).
 *
 * Also checks whether each colliding move is available as a TM or Tutor move
 * in Relumi (BDSP game data).
 *
 * Output is split into two files:
 *   - level-collisions-tm-tutor.txt: collisions where at least one move
 *     is available as a Relumi TM or Tutor
 *   - level-collisions-no-tm-tutor.txt: collisions where no move is
 *     available as a Relumi TM or Tutor
 *
 * Usage: npx ts-node scripts/dev-utility/find-level-collisions.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {Learnsets as Gen8RelumiLearnsets} from '../../data/mods/gen8relumi/learnsets';
import {Learnsets as MainLearnsets} from '../../data/learnsets';
import {Pokedex} from '../../data/pokedex';

// ---- Move name normalization (like learnset IDs) ----
function normalizeName(name: string): string {
	return name.toLowerCase().replace(/[\s\-']/g, '');
}

// ---- Entry parsers ----

function getLevelNumber(entry: string): number | null {
	const match = entry.match(/^\d+L(\d+)$/);
	return match ? parseInt(match[1], 10) : null;
}

function getGenNumber(entry: string): number | null {
	const match = entry.match(/^(\d+)/);
	return match ? parseInt(match[1], 10) : null;
}

function getEntrySortOrder(entry: string): number {
	if (/^\d+L\d+$/.test(entry)) return 0;
	if (/^\d+M$/.test(entry)) return 1;
	if (/^\d+T$/.test(entry)) return 2;
	if (/^\d+E$/.test(entry)) return 3;
	if (/^\d+S\d/.test(entry)) return 4;
	return 5;
}

function getEntryLabel(entry: string): string {
	const levelMatch = entry.match(/^\d+L(\d+)$/);
	if (levelMatch) return `Lv${levelMatch[1]}`;
	if (/^\d+M$/.test(entry)) return 'TM';
	if (/^\d+T$/.test(entry)) return 'Tutor';
	if (/^\d+E$/.test(entry)) return 'Egg';
	if (/^\d+S\d/.test(entry)) return 'Event';
	return entry;
}

// ---- Main learnset entries ----

function getMainLearnsetEntries(
	pokemonId: string,
	moveName: string,
): string[] {
	const monData = (MainLearnsets as Record<string, any>)[pokemonId];
	if (!monData?.learnset) return [];

	const entries: string[] | undefined = monData.learnset[moveName];
	if (!entries) return [];

	return entries.filter(e => {
		const gen = getGenNumber(e);
		return gen !== null && gen >= 7 && gen <= 9;
	}).sort((a, b) => {
		const genA = getGenNumber(a) ?? 0;
		const genB = getGenNumber(b) ?? 0;
		if (genA !== genB) return genB - genA;
		return getEntrySortOrder(a) - getEntrySortOrder(b);
	});
}

// ---- Vanilla collision detection ----

/**
 * Returns true if ALL the given moves are learned at the same level
 * in any vanilla gen (9, 8, or 7). The shared level doesn't need to
 * match the Relumi level — what matters is that the same set of moves
 * also collide with each other in vanilla.
 */
function collideInVanilla(
	pokemonId: string,
	moveNames: string[],
): boolean {
	for (const gen of [9, 8, 7]) {
		// For each move, collect its level-up levels in this gen
		const moveLevelSets: Set<number>[] = [];
		for (const moveName of moveNames) {
			const entries = getMainLearnsetEntries(pokemonId, moveName);
			const levels = new Set<number>();
			for (const e of entries) {
				if (getGenNumber(e) === gen) {
					const lv = getLevelNumber(e);
					if (lv !== null) levels.add(lv);
				}
			}
			moveLevelSets.push(levels);
		}

		// If any move has no level-up in this gen, can't collide
		if (moveLevelSets.some(ls => ls.size === 0)) continue;

		// Check if all moves share at least one level
		const shared = new Set(moveLevelSets[0]);
		for (let i = 1; i < moveLevelSets.length; i++) {
			for (const lv of shared) {
				if (!moveLevelSets[i].has(lv)) shared.delete(lv);
			}
			if (shared.size === 0) break;
		}

		if (shared.size > 0) return true;
	}
	return false;
}

// ---- Relumi TM/Tutor lookup ----

function buildMoveIdLookup(): Map<string, number> {
	// Parse english_ss_wazaname.json to get move ID -> English name
	const wazanamePath = path.resolve(__dirname, '../../game-files/english_ss_wazaname.json');
	const wazanameData = JSON.parse(fs.readFileSync(wazanamePath, 'utf-8'));
	const labelArray: Array<{arrayIndex: number; wordDataArray: Array<{str: string}>}> = wazanameData.labelDataArray;

	// Build normalized name -> move ID
	const nameToId = new Map<string, number>();
	for (const entry of labelArray) {
		const id = entry.arrayIndex;
		const displayName = entry.wordDataArray?.[0]?.str;
		if (displayName && displayName !== '———') {
			nameToId.set(normalizeName(displayName), id);
		}
	}
	return nameToId;
}

function buildTutorMoveIdSet(): Set<number> {
	const tutorDir = path.resolve(__dirname, 'MoveTutor');
	const tutorIds = new Set<number>();
	if (!fs.existsSync(tutorDir)) return tutorIds;

	const files = fs.readdirSync(tutorDir).filter(f => f.endsWith('.json'));
	for (const file of files) {
		const data = JSON.parse(fs.readFileSync(path.join(tutorDir, file), 'utf-8'));
		for (const moveId of (data.moves || []) as number[]) {
			tutorIds.add(moveId);
		}
	}
	return tutorIds;
}

function buildTmMoveIdSet(): Set<number> {
	const itemTablePath = path.resolve(__dirname, '../../game-files/ItemTable.json');
	const itemData = JSON.parse(fs.readFileSync(itemTablePath, 'utf-8'));
	const wazaMachines: Array<{wazaNo: number}> = itemData.WazaMachine || [];
	const tmIds = new Set<number>();
	for (const machine of wazaMachines) {
		tmIds.add(machine.wazaNo);
	}
	return tmIds;
}

// ---- Main ----

interface CollisionBlock {
	moveCount: number;
	pokemonId: string;
	level: number;
	text: string;
}

function main() {
	const outputPathTmTutor = path.resolve(__dirname, 'level-collisions-tm-tutor.txt');
	const outputPathNoTmTutor = path.resolve(__dirname, 'level-collisions-no-tm-tutor.txt');

	// Build Relumi TM/Tutor lookups
	console.log('Loading Relumi TM/Tutor data...');
	const nameToId = buildMoveIdLookup();
	const tutorIds = buildTutorMoveIdSet();
	const tmIds = buildTmMoveIdSet();
	console.log(`  ${nameToId.size} move names loaded`);
	console.log(`  ${tutorIds.size} tutor moves, ${tmIds.size} TM moves`);

	const blocksTmTutor: CollisionBlock[] = [];
	const blocksNoTmTutor: CollisionBlock[] = [];

	let totalCollisionPokemon = 0;
	let totalCollisions = 0;
	let totalTmTutorPokemon = 0;
	let totalTmTutorCollisions = 0;
	let totalNoTmTutorPokemon = 0;
	let totalNoTmTutorCollisions = 0;
	let filteredByVanilla = 0; // collisions filtered out (also collide in vanilla)
	let filteredNoVanillaData = 0; // Pokemon skipped (no vanilla learnset at all)

	const pokemonIds = Object.keys(Gen8RelumiLearnsets as Record<string, any>).sort();

	for (const pokemonId of pokemonIds) {
		const pokemonData = (Gen8RelumiLearnsets as Record<string, any>)[pokemonId];
		const learnset: Record<string, string[]> | undefined = pokemonData?.learnset;
		if (!learnset) continue;

		// Filter out official forms (in Pokedex) that have no vanilla learnset
		// (battle-only forms like gmax/weather). Pokemon not in Pokedex at all
		// are Relumi-only customs — include them.
		const inPokedex = (Pokedex as Record<string, any>)[pokemonId] !== undefined;
		const vanillaData = (MainLearnsets as Record<string, any>)[pokemonId];
		if (inPokedex && !vanillaData?.learnset) {
			filteredNoVanillaData++;
			continue;
		}

		const levelToMoves: Map<number, Array<{move: string; entries: string[]}>> = new Map();

		for (const [moveName, entries] of Object.entries(learnset) as [string, string[]][]) {
			for (const entry of entries) {
				const level = getLevelNumber(entry);
				if (level !== null) {
					if (!levelToMoves.has(level)) {
						levelToMoves.set(level, []);
					}
					levelToMoves.get(level)!.push({move: moveName, entries});
				}
			}
		}

		let hadCollision = false;
		let hadTmTutorCollision = false;
		let hadNoTmTutorCollision = false;
		const sortedLevels = [...levelToMoves.keys()].filter(l => l !== 1).sort((a, b) => a - b);

		for (const level of sortedLevels) {
			const moves = levelToMoves.get(level)!;
			if (moves.length < 2) continue;

			// Filter out if these same moves also collide in vanilla
			if (collideInVanilla(pokemonId, moves.map(m => m.move))) {
				filteredByVanilla++;
				continue;
			}

			hadCollision = true;
			totalCollisions++;

			// Determine if any move in this collision is available as Relumi TM/Tutor
			let collisionHasTmTutor = false;
			const moveTags: string[] = [];
			for (const m of moves) {
				const moveId = nameToId.get(normalizeName(m.move));
				const tags: string[] = [];
				if (moveId !== undefined) {
					if (tutorIds.has(moveId)) tags.push('Relumi Tutor');
					if (tmIds.has(moveId)) tags.push('Relumi TM');
				}
				moveTags.push(tags.length > 0 ? `  [${tags.join(', ')}]` : '');
				if (tags.length > 0) collisionHasTmTutor = true;
			}

			if (collisionHasTmTutor) {
				hadTmTutorCollision = true;
				totalTmTutorCollisions++;
			} else {
				hadNoTmTutorCollision = true;
				totalNoTmTutorCollisions++;
			}

			// Build the collision block text
			let block = '';
			const moveNames = moves.map(m => m.move).join(', ');
			block += `--- ${pokemonId} ---\n`;
			block += `  Level ${level}: ${moveNames}\n`;
			block += `    Gen8Relumi entries:\n`;
			for (let i = 0; i < moves.length; i++) {
				const m = moves[i];
				const labels = m.entries.map(e => getEntryLabel(e));
				block += `      ${m.move}: ${labels.join(', ')}${moveTags[i]}\n`;
			}
			block += `    Vanilla learnset:\n`;

			const mainData: Array<{move: string; entries: string[]}> = [];
			for (const m of moves) {
				mainData.push({
					move: m.move,
					entries: getMainLearnsetEntries(pokemonId, m.move),
				});
			}

			for (const gen of [9, 8, 7]) {
				const hasAny = mainData.some(d => d.entries.some(e => getGenNumber(e) === gen));
				if (!hasAny) continue;

				block += `      Gen ${gen}:\n`;
				for (const d of mainData) {
					const genEntries = d.entries.filter(e => getGenNumber(e) === gen);
					if (genEntries.length > 0) {
						const labels = genEntries.map(e => getEntryLabel(e));
						block += `        ${d.move}: ${labels.join(', ')}\n`;
					} else {
						block += `        ${d.move}: (not learned)\n`;
					}
				}
			}
			// Remove trailing newline for clean blank-line separation
			block = block.replace(/\n$/, '');

			const cBlock: CollisionBlock = {
				moveCount: moves.length,
				pokemonId,
				level,
				text: block,
			};

			if (collisionHasTmTutor) {
				blocksTmTutor.push(cBlock);
			} else {
				blocksNoTmTutor.push(cBlock);
			}
		}

		if (hadCollision) {
			totalCollisionPokemon++;
		}
		if (hadTmTutorCollision) {
			totalTmTutorPokemon++;
		}
		if (hadNoTmTutorCollision) {
			totalNoTmTutorPokemon++;
		}
	}

	// Sort blocks by move count (descending), then pokemonId, then level
	const sortFn = (a: CollisionBlock, b: CollisionBlock) => {
		if (a.moveCount !== b.moveCount) return b.moveCount - a.moveCount;
		if (a.pokemonId !== b.pokemonId) return a.pokemonId.localeCompare(b.pokemonId);
		return a.level - b.level;
	};
	blocksTmTutor.sort(sortFn);
	blocksNoTmTutor.sort(sortFn);

	// Build final output strings
	const headerCommon =
		'=== Gen8 Relumi Level Collision Finder ===\n' +
		'\n' +
		'Finding Pokemon that learn two or more different moves at the same level.\n' +
		'(Level 1 is ignored. Official forms without vanilla learnsets and collisions that also occur in vanilla gens 7-9 are filtered out.)\n' +
		'\n';

	let outTmTutor = headerCommon;
	for (const b of blocksTmTutor) {
		outTmTutor += b.text + '\n\n';
	}
	outTmTutor += '=== Summary ===\n';
	outTmTutor += `Total Pokemon with level collisions (TM/Tutor available): ${totalTmTutorPokemon}\n`;
	outTmTutor += `Total levels with collisions (TM/Tutor available): ${totalTmTutorCollisions}\n`;

	let outNoTmTutor = headerCommon;
	for (const b of blocksNoTmTutor) {
		outNoTmTutor += b.text + '\n\n';
	}
	outNoTmTutor += '=== Summary ===\n';
	outNoTmTutor += `Total Pokemon with level collisions (no TM/Tutor): ${totalNoTmTutorPokemon}\n`;
	outNoTmTutor += `Total levels with collisions (no TM/Tutor): ${totalNoTmTutorCollisions}\n`;

	fs.writeFileSync(outputPathTmTutor, outTmTutor, 'utf-8');
	fs.writeFileSync(outputPathNoTmTutor, outNoTmTutor, 'utf-8');

	console.log(`Output written to ${outputPathTmTutor}`);
	console.log(`  ${totalTmTutorPokemon} Pokemon, ${totalTmTutorCollisions} levels (TM/Tutor available)`);
	console.log(`Output written to ${outputPathNoTmTutor}`);
	console.log(`  ${totalNoTmTutorPokemon} Pokemon, ${totalNoTmTutorCollisions} levels (no TM/Tutor)`);
	console.log(`Combined: ${totalCollisionPokemon} Pokemon, ${totalCollisions} levels`);
	console.log(`Filtered out (also collide in vanilla): ${filteredByVanilla} collisions`);
	console.log(`Filtered out (no vanilla learnset): ${filteredNoVanillaData} Pokemon`);
}

main();
