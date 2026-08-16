/**
 * Dev-utility script that finds tutor moves a Pokemon learns in Relumi
 * (data/mods/gen8relumi/learnsets.ts) but does NOT learn in vanilla
 * (data/learnsets.ts) through ANY method (level-up, egg, TM, tutor, event,
 * etc.).
 *
 * The Relumi side counts only tutor moves (learnset entries with a "T"
 * source, e.g. "9T"). The vanilla side counts every move the Pokemon learns
 * in any generation, including eventData.
 *
 * Species without a vanilla learnset of their own (Megas, Gmax, Arceus /
 * Deoxys / Genesect formes, cosmetic formes, etc.) are skipped and reported,
 * since they inherit another form's learnset and have nothing to compare.
 *
 * Output (written to relumi-tutor-moves-not-in-vanilla.txt in this folder):
 *   - A summary of compared/skipped species and new-move counts.
 *   - Every species (display name where available) that gains at least one
 *     tutor move not learned in vanilla, alphabetically sorted.
 *
 * Usage: npx ts-node scripts/dev-utility/list-relumi-tutor-moves.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {Learnsets as VanillaLearnsets} from '../../data/learnsets';
import {Learnsets as RelumiLearnsets} from '../../data/mods/gen8relumi/learnsets';
import {Pokedex as RelumiPokedex} from '../../data/mods/gen8relumi/pokedex';
import {Pokedex as VanillaPokedex} from '../../data/pokedex';

interface LearnsetEntry {
	learnset?: Record<string, string[]>;
	eventData?: Array<{moves?: string[]}>;
}

type LearnsetTable = Record<string, LearnsetEntry>;
type PokedexTable = Record<string, {name?: string; num?: number}>;

/** Tutor-move learnset entries end in a "T" source, e.g. "9T". */
function isTutorEntry(entry: string): boolean {
	return /^\d+T$/.test(entry);
}

/** Display name for a species, falling back to its ID when no name exists. */
function speciesName(speciesId: string): string {
	const relumiName = (RelumiPokedex as unknown as PokedexTable)[speciesId]?.name;
	if (relumiName) return relumiName;
	const vanillaName = (VanillaPokedex as unknown as PokedexTable)[speciesId]?.name;
	if (vanillaName) return vanillaName;
	return speciesId;
}

/** National dex number for a species, falling back to the ID when unknown. */
function speciesNum(speciesId: string): number {
	const relumiNum = (RelumiPokedex as unknown as PokedexTable)[speciesId]?.num;
	if (typeof relumiNum === 'number') return relumiNum;
	const vanillaNum = (VanillaPokedex as unknown as PokedexTable)[speciesId]?.num;
	if (typeof vanillaNum === 'number') return vanillaNum;
	return Number.MAX_SAFE_INTEGER;
}

/** Every move a species learns in vanilla, via any method (learnset + eventData). */
function vanillaMovesForSpecies(speciesData: LearnsetEntry | undefined): Set<string> {
	const moves = new Set<string>(Object.keys(speciesData?.learnset || {}));
	for (const event of speciesData?.eventData || []) {
		for (const moveId of event?.moves || []) moves.add(moveId);
	}
	return moves;
}

/** Tutor moves a species learns in Relumi, as a set of move IDs. */
function relumiTutorMovesForSpecies(speciesData: LearnsetEntry | undefined): Set<string> {
	const moves = new Set<string>();
	for (const [moveId, entries] of Object.entries(speciesData?.learnset || {})) {
		if (entries.some(isTutorEntry)) moves.add(moveId);
	}
	return moves;
}

function main() {
	const vanilla = VanillaLearnsets as unknown as LearnsetTable;
	const relumi = RelumiLearnsets as unknown as LearnsetTable;
	const speciesIds = Object.keys(relumi).sort((a, b) => {
		const numDiff = speciesNum(a) - speciesNum(b);
		if (numDiff !== 0) return numDiff;
		return a.localeCompare(b);
	});

	const body: string[] = [];
	let comparedSpecies = 0;
	let skippedSpecies = 0;
	let affectedSpecies = 0;
	let totalNewMoves = 0;
	const distinctNewMoves = new Set<string>();

	for (const speciesId of speciesIds) {
		const vanillaData = vanilla[speciesId];
		if (!vanillaData?.learnset) {
			skippedSpecies++;
			continue;
		}
		comparedSpecies++;

		const relumiTutor = relumiTutorMovesForSpecies(relumi[speciesId]);
		const vanillaMoves = vanillaMovesForSpecies(vanillaData);

		const newMoves = [...relumiTutor]
			.filter(moveId => !vanillaMoves.has(moveId))
			.sort();
		if (newMoves.length === 0) continue;

		affectedSpecies++;
		totalNewMoves += newMoves.length;
		for (const moveId of newMoves) distinctNewMoves.add(moveId);
		body.push(`#${speciesNum(speciesId)} ${speciesName(speciesId)} (${speciesId}): ${newMoves.join(', ')}`);
	}

	const header = [
		'=== Relumi Tutor Moves Not Learned in Vanilla (Any Method) ===',
		'',
		`Species in Relumi learnsets: ${speciesIds.length}`,
		`Compared (have their own vanilla learnset): ${comparedSpecies}`,
		`Skipped (no vanilla learnset): ${skippedSpecies}`,
		`Species with new tutor moves: ${affectedSpecies}`,
		`New tutor moves per Pokemon: ${totalNewMoves}`,
		`Distinct new tutor moves: ${distinctNewMoves.size}`,
		'',
	];

	const output = header.join('\n') + '\n' + body.join('\n') + '\n';
	const outputPath = path.resolve(__dirname, 'relumi-tutor-moves-not-in-vanilla.txt');
	fs.writeFileSync(outputPath, output, 'utf-8');
	console.log(`Output written to ${outputPath}`);
	console.log(
		`${affectedSpecies} species with new tutor moves ` +
		`(${totalNewMoves} moves, ${distinctNewMoves.size} distinct; ${skippedSpecies} skipped)`,
	);
}

main();
