/**
 * Dev-utility script that compares the Champions (data/mods/champions/learnsets.ts)
 * and Z-A (data/mods/gen9legends/learnsets.ts) learnsets against vanilla
 * (data/learnsets.ts), and writes a CSV with one row per Pokemon and these
 * columns:
 *
 *   Pokemon, Only in Champions, Both Champions and Z-A, Only in Z-A,
 *   Already in Relumi, Being added to Relumi, Gen 9 Additions
 *
 * The last two columns are emitted empty for manual filling in.
 *
 * For each Pokemon the three move columns are, relative to vanilla:
 *   - "Only in Champions": moves the Pokemon gains in Champions but not Z-A.
 *   - "Both Champions and Z-A": moves the Pokemon gains in both mods.
 *   - "Only in Z-A": moves the Pokemon gains in Z-A but not Champions (any move
 *     added relative to vanilla, regardless of whether it appears in Champions).
 *
 * "Already in Relumi" lists, for the union of the three move columns, which of
 * those moves the Pokemon already learns in Relumi (data/mods/gen8relumi),
 * annotated with its Relumi learning method(s) in brackets. Egg moves inherited
 * from a pre-evolution are included too.
 *
 * "In vanilla" counts every move a species learns in any generation, including
 * eventData and egg moves inherited from pre-evolutions (which are often listed
 * only on the first stage). All species, including pre-evolutions, are included.
 * Moves within each cell are listed one per line.
 *
 * Output is written to champions-za-learnset-comparison.csv in this folder.
 *
 * Usage: npx ts-node scripts/dev-utility/compare-champions-za-learnsets.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {Learnsets as VanillaLearnsets} from '../../data/learnsets';
import {Learnsets as ChampionsLearnsets} from '../../data/mods/champions/learnsets';
import {Learnsets as ZALearnsets} from '../../data/mods/gen9legends/learnsets';
import {Learnsets as RelumiLearnsets} from '../../data/mods/gen8relumi/learnsets';
import {Pokedex as VanillaPokedex} from '../../data/pokedex';

interface LearnsetEntry {
	learnset?: Record<string, string[]>;
	eventData?: Array<{moves?: string[]}>;
}

type LearnsetTable = Record<string, LearnsetEntry>;
type PokedexTable = Record<string, {name?: string; num?: number; evos?: string[]; prevo?: string}>;

/** True when a learnset source tag denotes an egg move (e.g. "9E", "8E"). */
function isEggSource(source: string): boolean {
	return source.endsWith('E');
}

/** Egg moves for a species: moves available through breeding. */
function eggMovesForSpecies(speciesData: LearnsetEntry | undefined): Set<string> {
	const moves = new Set<string>();
	for (const [moveId, sources] of Object.entries(speciesData?.learnset || {})) {
		if (sources.some(isEggSource)) moves.add(moveId);
	}
	return moves;
}

/** Convert a Pokemon name (e.g. "Mr. Mime-Galar") to its species ID (e.g. "mrmimegalar"). */
function toID(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** All pre-evolution species IDs, walking up the vanilla `prevo` chain. */
function preEvolutionIds(speciesId: string): string[] {
	const pokedex = VanillaPokedex as unknown as PokedexTable;
	const ids: string[] = [];
	const seen = new Set<string>([speciesId]);
	let current: string | undefined = pokedex[speciesId]?.prevo;
	while (current) {
		const id = toID(current);
		if (seen.has(id)) break;
		seen.add(id);
		ids.push(id);
		current = pokedex[id]?.prevo;
	}
	return ids;
}

/** Every move a species learns in vanilla: learnset, eventData, and inherited egg moves. */
function vanillaMovesForSpecies(vanilla: LearnsetTable, speciesId: string): Set<string> {
	const speciesData = vanilla[speciesId];
	const moves = new Set<string>(Object.keys(speciesData?.learnset || {}));
	for (const event of speciesData?.eventData || []) {
		for (const moveId of event?.moves || []) moves.add(moveId);
	}
	// Egg moves are frequently listed only on the first stage of a line, so
	// count them for every pre-evolution to avoid flagging them as new.
	for (const preId of preEvolutionIds(speciesId)) {
		for (const moveId of eggMovesForSpecies(vanilla[preId])) moves.add(moveId);
	}
	return moves;
}

/** Every move a species learns in a mod learnset (learnset keys only). */
function modMovesForSpecies(speciesData: LearnsetEntry | undefined): Set<string> {
	return new Set<string>(Object.keys(speciesData?.learnset || {}));
}

/** Display name for a species, falling back to its ID. */
function speciesName(speciesId: string): string {
	return (VanillaPokedex as unknown as PokedexTable)[speciesId]?.name || speciesId;
}

/** National dex number for a species, falling back to the ID when unknown. */
function speciesNum(speciesId: string): number {
	const num = (VanillaPokedex as unknown as PokedexTable)[speciesId]?.num;
	return typeof num === 'number' ? num : Number.MAX_SAFE_INTEGER;
}

/** Escape a value as a CSV field, quoting if it contains commas, quotes, or newlines. */
function csvCell(value: string): string {
	if (/[\",\n\r]/.test(value)) {
		return '"' + value.replace(/"/g, '""') + '"';
	}
	return value;
}

/** Relumi learning method(s) for a move, or null when not learned in Relumi. */
function relumiMethod(relumi: LearnsetTable, speciesId: string, moveId: string): string | null {
	const sources = relumi[speciesId]?.learnset?.[moveId];
	if (sources && sources.length > 0) return sources.join(', ');
	// Egg moves are often only listed on the first stage; check pre-evolutions.
	for (const preId of preEvolutionIds(speciesId)) {
		const preSources = relumi[preId]?.learnset?.[moveId];
		if (preSources && preSources.some(isEggSource)) {
			return `${preSources.filter(isEggSource).join(', ')} via ${speciesName(preId)}`;
		}
	}
	return null;
}

interface Row {
	speciesId: string;
	onlyChampions: string[];
	both: string[];
	onlyZA: string[];
	alreadyInRelumi: string[];
}

function main() {
	const vanilla = VanillaLearnsets as unknown as LearnsetTable;
	const champions = ChampionsLearnsets as unknown as LearnsetTable;
	const za = ZALearnsets as unknown as LearnsetTable;
	const relumi = RelumiLearnsets as unknown as LearnsetTable;

	// Union of every species that appears in either mod learnset.
	const speciesIds = [...new Set([...Object.keys(champions), ...Object.keys(za)])].sort();

	const rows: Row[] = [];
	let comparedSpecies = 0;
	let skippedSpecies = 0;

	for (const speciesId of speciesIds) {
		const vanillaData = vanilla[speciesId];
		if (!vanillaData?.learnset) {
			// Species with no vanilla learnset of their own; nothing to compare against.
			skippedSpecies++;
			continue;
		}
		comparedSpecies++;

		const vanillaMoves = vanillaMovesForSpecies(vanilla, speciesId);
		const championMoves = modMovesForSpecies(champions[speciesId]);
		const zaMoves = modMovesForSpecies(za[speciesId]);

		const championsAdded = [...championMoves].filter(m => !vanillaMoves.has(m)).sort();
		const zaAdded = [...zaMoves].filter(m => !vanillaMoves.has(m)).sort();

		const onlyChampions = championsAdded.filter(m => !zaMoves.has(m));
		const both = championsAdded.filter(m => zaMoves.has(m));
		const onlyZA = zaAdded.filter(m => !championMoves.has(m));

		// For the union of the three move columns, note which moves Relumi already
		// teaches this Pokemon, with the learning method(s) shown in brackets.
		const addedUnion = [...new Set([...onlyChampions, ...both, ...onlyZA])].sort();
		const alreadyInRelumi = addedUnion
			.map(moveId => {
				const method = relumiMethod(relumi, speciesId, moveId);
				return method === null ? null : `${moveId} (${method})`;
			})
			.filter((entry): entry is string => entry !== null);

		rows.push({speciesId, onlyChampions, both, onlyZA, alreadyInRelumi});
	}

	rows.sort((a, b) => {
		const numDiff = speciesNum(a.speciesId) - speciesNum(b.speciesId);
		if (numDiff !== 0) return numDiff;
		return a.speciesId.localeCompare(b.speciesId);
	});

	const header = [
		'Pokemon',
		'Only in Champions',
		'Both Champions and Z-A',
		'Only in Z-A',
		'Already in Relumi',
		'Being added to Relumi',
		'Gen 9 Additions',
	];

	const lines: string[] = [header.map(csvCell).join(',')];
	for (const row of rows) {
		lines.push([
			csvCell(speciesName(row.speciesId)),
			csvCell(row.onlyChampions.join('\n')),
			csvCell(row.both.join('\n')),
			csvCell(row.onlyZA.join('\n')),
			csvCell(row.alreadyInRelumi.join('\n')),
			'', // Being added to Relumi
			'', // Gen 9 Additions
		].join(','));
	}

	const output = lines.join('\n') + '\n';
	const outputPath = path.resolve(__dirname, 'champions-za-learnset-comparison.csv');
	fs.writeFileSync(outputPath, output, 'utf-8');

	const count = (fn: (r: Row) => string[]) => rows.filter(r => fn(r).length > 0).length;
	console.log(`Output written to ${outputPath}`);
	console.log(`Rows: ${rows.length} | no vanilla learnset: ${skippedSpecies}`);
	console.log(`Only in Champions: ${count(r => r.onlyChampions)} species`);
	console.log(`Both Champions and Z-A: ${count(r => r.both)} species`);
	console.log(`Only in Z-A: ${count(r => r.onlyZA)} species`);
	console.log(`Already in Relumi: ${count(r => r.alreadyInRelumi)} species`);
}

main();
