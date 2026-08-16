/**
 * Dev-utility script that lists every TM move in Relumi
 * (data/mods/gen8relumi/learnsets.ts), ordered from least to most used:
 * for each move it counts how many Pokemon learn it via a TM.
 *
 * A move counts as a TM if its learnset entry has an "M" source (e.g. "9M").
 * Each move is counted once per Pokemon, even if that Pokemon has multiple
 * "M" entries (older gens + gen 9).
 *
 * Output (written to relumi-tm-moves-by-count.txt in this folder):
 *   - A summary of total species, distinct TM moves, and total TM occurrences.
 *   - The TM moves ordered by learner count (least used first, ties broken
 *     alphabetically), each with its count.
 *
 * Usage: npx ts-node scripts/dev-utility/list-relumi-tm-moves.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {Learnsets as RelumiLearnsets} from '../../data/mods/gen8relumi/learnsets';

interface LearnsetEntry {
	learnset?: Record<string, string[]>;
}

type LearnsetTable = Record<string, LearnsetEntry>;

/** TM learnset entries end in an "M" source, e.g. "9M". */
function isTmEntry(entry: string): boolean {
	return /^\d+M$/.test(entry);
}

function main() {
	const relumi = RelumiLearnsets as unknown as LearnsetTable;
	const counts = new Map<string, number>();

	for (const speciesData of Object.values(relumi)) {
		for (const [moveId, entries] of Object.entries(speciesData?.learnset || {})) {
			if (entries.some(isTmEntry)) {
				counts.set(moveId, (counts.get(moveId) || 0) + 1);
			}
		}
	}

	const sorted = [...counts.entries()].sort(
		(a, b) => a[1] - b[1] || a[0].localeCompare(b[0]),
	);

	const totalOccurrences = sorted.reduce((sum, [, count]) => sum + count, 0);

	const lines = [
		'=== Relumi TM Moves (least used to most used) ===',
		'',
		`Species in Relumi learnsets: ${Object.keys(relumi).length}`,
		`Distinct TM moves: ${sorted.length}`,
		`Total TM occurrences: ${totalOccurrences}`,
		'',
		'count\tmove',
	];
	for (const [moveId, count] of sorted) {
		lines.push(`${count}\t${moveId}`);
	}

	const outputPath = path.resolve(__dirname, 'relumi-tm-moves-by-count.txt');
	fs.writeFileSync(outputPath, lines.join('\n') + '\n', 'utf-8');
	console.log(`Output written to ${outputPath}`);
	console.log(`Distinct TM moves: ${sorted.length} (${totalOccurrences} total occurrences)`);
}

main();
