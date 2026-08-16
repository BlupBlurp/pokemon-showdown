/**
 * Debug script that finds moves present in the vanilla learnset file
 * (data/learnsets.ts) that never appear anywhere in the Relumi learnset
 * file (data/mods/gen8relumi/learnsets.ts).
 *
 * A move is considered "in vanilla" if any Pokemon learns it through its
 * learnset (level-up, egg, TM, tutor, event, etc.) or through its eventData.
 * A move is considered "in Relumi" if it appears in any Pokemon's Relumi
 * learnset (level-up, egg, TM, tutor).
 *
 * Results are grouped by the earliest vanilla generation in which the move
 * is learned, and each move shows the full generation range it appears in.
 *
 * Output:
 *   - Counts of vanilla/Relumi/missing moves.
 *   - The missing moves grouped by vanilla generation.
 *
 * Usage: npx ts-node scripts/dev-utility/find-missing-moves.ts
 */

import {Learnsets as VanillaLearnsets} from '../../data/learnsets';
import {Learnsets as RelumiLearnsets} from '../../data/mods/gen8relumi/learnsets';

interface LearnsetEntry {
	learnset?: Record<string, string[]>;
	eventData?: Array<{generation?: number; moves?: string[]}>;
}

type LearnsetTable = Record<string, LearnsetEntry>;

interface MoveInfo {
	learners: number;
	gens: Set<number>;
}

/** Leading digit of a learnset source like "9M", "8L1", "7V", "6S5". */
function sourceGen(entry: string): number | null {
	const match = entry.match(/^(\d)/);
	return match ? parseInt(match[1], 10) : null;
}

function collectVanillaMoves(): Map<string, MoveInfo> {
	const moves = new Map<string, MoveInfo>();
	const table = VanillaLearnsets as unknown as LearnsetTable;

	const getInfo = (moveId: string): MoveInfo => {
		let info = moves.get(moveId);
		if (!info) {
			info = {learners: 0, gens: new Set()};
			moves.set(moveId, info);
		}
		return info;
	};

	for (const speciesData of Object.values(table)) {
		for (const [moveId, entries] of Object.entries(speciesData?.learnset || {})) {
			const info = getInfo(moveId);
			info.learners++;
			for (const entry of entries) {
				const gen = sourceGen(entry);
				if (gen !== null) info.gens.add(gen);
			}
		}
		for (const event of speciesData?.eventData || []) {
			for (const moveId of event?.moves || []) {
				const info = getInfo(moveId);
				if (typeof event?.generation === 'number') info.gens.add(event.generation);
			}
		}
	}
	return moves;
}

/** All moves referenced by any Relumi learnset. */
function collectRelumiMoves(): Set<string> {
	const moves = new Set<string>();
	const table = RelumiLearnsets as unknown as LearnsetTable;
	for (const speciesData of Object.values(table)) {
		for (const moveId of Object.keys(speciesData?.learnset || {})) {
			moves.add(moveId);
		}
	}
	return moves;
}

function formatGens(gens: Set<number>): string {
	const sorted = [...gens].sort((a, b) => a - b);
	if (sorted.length === 0) return 'unknown gen';
	if (sorted.length === 1) return `gen ${sorted[0]}`;
	const contiguous = sorted.every((g, i) => i === 0 || g === sorted[i - 1] + 1);
	if (contiguous) return `gens ${sorted[0]}-${sorted[sorted.length - 1]}`;
	return `gens ${sorted.join(', ')}`;
}

function main() {
	const vanillaMoves = collectVanillaMoves();
	const relumiMoves = collectRelumiMoves();

	const missing = [...vanillaMoves.keys()]
		.filter(moveId => !relumiMoves.has(moveId))
		.sort();

	console.log('=== Moves learned in vanilla but never learned in Relumi ===');
	console.log('');
	console.log(`Vanilla moves (learnset + eventData): ${vanillaMoves.size}`);
	console.log(`Relumi learnset moves: ${relumiMoves.size}`);
	console.log(`Missing from Relumi: ${missing.length}`);
	console.log('');

	if (missing.length === 0) {
		console.log('Every vanilla move appears somewhere in Relumi.');
		return;
	}

	// Group missing moves by their earliest vanilla generation.
	const byGen = new Map<number, string[]>();
	for (const moveId of missing) {
		const info = vanillaMoves.get(moveId)!;
		const introGen = info.gens.size ? Math.min(...info.gens) : -1;
		if (!byGen.has(introGen)) byGen.set(introGen, []);
		byGen.get(introGen)!.push(moveId);
	}

	for (const gen of [...byGen.keys()].sort((a, b) => a - b)) {
		const moves = byGen.get(gen)!;
		const label = gen === -1 ? 'Unknown gen' : `Gen ${gen}`;
		console.log(`${label} (${moves.length}):`);
		for (const moveId of moves) {
			const info = vanillaMoves.get(moveId)!;
			const learners = info.learners
				? `${info.learners} learner(s)`
				: 'eventData only';
			console.log(`  - ${moveId} [${formatGens(info.gens)}] [${learners}]`);
		}
		console.log('');
	}
}

main();
