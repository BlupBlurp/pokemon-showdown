/**
 * Debug script that compares, Pokemon by Pokemon, the moves each one can learn
 * in vanilla (data/learnsets.ts, any method in any generation) against the moves
 * it can learn in Relumi (data/mods/gen8relumi/learnsets.ts).
 *
 * For every move, it counts how many Pokemon learn that move in vanilla but do
 * NOT learn it at all in Relumi, then prints the moves ordered by that count
 * (most widely removed first).
 *
 * A move counts as "learned in vanilla" if it appears anywhere in the species'
 * learnset (level-up, egg, TM, tutor, event, etc.) or in its eventData. Gen 9
 * sources are ignored, so only moves learned in gens 1-8 are considered.
 * A move counts as "learned in Relumi" if it appears in the species' Relumi
 * learnset (level-up, egg, TM, tutor, etc.). A move is also considered available
 * in Relumi if it is an egg move ("E") on an earlier stage of the species'
 * evolution line, since Relumi stores egg moves only on the first stage.
 *
 * Only species present in BOTH files are compared: a Pokemon that has no Relumi
 * learnset at all is skipped, since every move would trivially count as missing.
 *
 * Output (also written to missing-moves-by-count.txt in this folder):
 *   - A summary of how many species were compared and how many were skipped.
 *   - The moves missing from at least one Pokemon, ordered by count.
 *     Moves available as TMs or tutor moves in Relumi are marked "(TM)"
 *     and/or "(Tutor)".
 *
 * Usage: npx ts-node scripts/dev-utility/find-missing-moves-by-count.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {Learnsets as VanillaLearnsets} from '../../data/learnsets';
import {Learnsets as RelumiLearnsets} from '../../data/mods/gen8relumi/learnsets';
import {Pokedex as VanillaPokedex} from '../../data/pokedex';

interface LearnsetEntry {
	learnset?: Record<string, string[]>;
	eventData?: Array<{generation?: number; moves?: string[]}>;
}

type LearnsetTable = Record<string, LearnsetEntry>;

interface PokedexEntry {
	prevo?: string;
	num?: number;
}

/** Leading generation digit of a learnset source like "8M" or "3L1". */
function entryGen(entry: string): number | null {
	const match = entry.match(/^(\d)/);
	return match ? parseInt(match[1], 10) : null;
}

/** Every move a species learns in vanilla gens 1-8 (learnset + eventData). */
function vanillaMovesForSpecies(speciesData: LearnsetEntry | undefined): Set<string> {
	const moves = new Set<string>();
	for (const [moveId, entries] of Object.entries(speciesData?.learnset || {})) {
		// Ignore gen 9: only count moves learned in gens 1-8.
		if (entries.some(entry => {
			const gen = entryGen(entry);
			return gen !== null && gen <= 8;
		})) {
			moves.add(moveId);
		}
	}
	for (const event of speciesData?.eventData || []) {
		if (typeof event?.generation === 'number' && event.generation <= 8) {
			for (const moveId of event?.moves || []) moves.add(moveId);
		}
	}
	return moves;
}

/** Every move a species learns in Relumi (learnset only). */
function relumiMovesForSpecies(speciesData: LearnsetEntry | undefined): Set<string> {
	return new Set(Object.keys(speciesData?.learnset || {}));
}

/**
 * Moves available as TMs and as tutor moves in Relumi, based on their learnset
 * sources ("M" for TM, "T" for tutor).
 */
function collectRelumiSourceMoves(): {tm: Set<string>; tutor: Set<string>} {
	const tm = new Set<string>();
	const tutor = new Set<string>();
	const table = RelumiLearnsets as unknown as LearnsetTable;
	for (const speciesData of Object.values(table)) {
		for (const [moveId, entries] of Object.entries(speciesData?.learnset || {})) {
			for (const entry of entries) {
				if (/^\d+M$/.test(entry)) tm.add(moveId);
				else if (/^\d+T$/.test(entry)) tutor.add(moveId);
			}
		}
	}
	return {tm, tutor};
}

/** Minimal toID: lowercase and strip non-alphanumerics (matches species IDs). */
function toID(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** speciesId -> prevo speciesId, built from the vanilla pokedex. */
function buildPrevoMap(): Map<string, string> {
	const map = new Map<string, string>();
	const table = VanillaPokedex as unknown as Record<string, PokedexEntry>;
	for (const [speciesId, data] of Object.entries(table)) {
		if (data?.prevo) map.set(speciesId, toID(data.prevo));
	}
	return map;
}

/** Species IDs that are CAP mons (negative pokedex number in vanilla). */
function buildCapSpeciesSet(): Set<string> {
	const set = new Set<string>();
	const table = VanillaPokedex as unknown as Record<string, PokedexEntry>;
	for (const [speciesId, data] of Object.entries(table)) {
		if (typeof data?.num === 'number' && data.num < 0) set.add(speciesId);
	}
	return set;
}

/** speciesId -> set of moves learned as egg moves ("E") in Relumi. */
function buildRelumiEggMoves(): Map<string, Set<string>> {
	const map = new Map<string, Set<string>>();
	const table = RelumiLearnsets as unknown as LearnsetTable;
	for (const [speciesId, speciesData] of Object.entries(table)) {
		const moves = new Set<string>();
		for (const [moveId, entries] of Object.entries(speciesData?.learnset || {})) {
			if (entries.some(entry => /^\d+E$/.test(entry))) moves.add(moveId);
		}
		if (moves.size) map.set(speciesId, moves);
	}
	return map;
}

/**
 * Moves a species can inherit as egg moves from its pre-evolution line. Relumi
 * stores egg moves only on the first stage, so an evolution can still get them
 * by breeding that first stage.
 */
function inheritedEggMovesFor(
	speciesId: string,
	prevoMap: Map<string, string>,
	eggMoves: Map<string, Set<string>>,
	cache: Map<string, Set<string>>,
): Set<string> {
	const cached = cache.get(speciesId);
	if (cached) return cached;

	const moves = new Set<string>();
	const seen = new Set<string>([speciesId]);
	let current = speciesId;
	while (prevoMap.has(current)) {
		current = prevoMap.get(current)!;
		if (seen.has(current)) break;
		seen.add(current);
		for (const moveId of eggMoves.get(current) || []) moves.add(moveId);
	}
	cache.set(speciesId, moves);
	return moves;
}

function main() {
	const vanilla = VanillaLearnsets as unknown as LearnsetTable;
	const relumi = RelumiLearnsets as unknown as LearnsetTable;

	const prevoMap = buildPrevoMap();
	const relumiEggMoves = buildRelumiEggMoves();
	const inheritedCache = new Map<string, Set<string>>();
	const capSpecies = buildCapSpeciesSet();

	const missingCounts = new Map<string, number>();
	let comparedSpecies = 0;
	let skippedSpecies = 0;
	let skippedCapSpecies = 0;
	let affectedSpecies = 0;
	let filteredEggCount = 0;

	for (const [speciesId, speciesData] of Object.entries(vanilla)) {
		const relumiData = relumi[speciesId];
		if (!relumiData?.learnset) {
			skippedSpecies++;
			if (capSpecies.has(speciesId)) skippedCapSpecies++;
			continue;
		}
		comparedSpecies++;

		const vanillaMoves = vanillaMovesForSpecies(speciesData);
		const relumiMoves = relumiMovesForSpecies(relumiData);
		const inheritedEggMoves = inheritedEggMovesFor(speciesId, prevoMap, relumiEggMoves, inheritedCache);

		let speciesMissingCount = 0;
		for (const moveId of vanillaMoves) {
			if (!relumiMoves.has(moveId)) {
				// Skip moves the species can still get as an egg move from its
				// first stage (Relumi only stores egg moves on the first stage).
				if (inheritedEggMoves.has(moveId)) {
					filteredEggCount++;
					continue;
				}
				missingCounts.set(moveId, (missingCounts.get(moveId) || 0) + 1);
				speciesMissingCount++;
			}
		}
		if (speciesMissingCount > 0) affectedSpecies++;
	}

	const sorted = [...missingCounts.entries()].sort(
		(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
	);
	const {tm: tmMoves, tutor: tutorMoves} = collectRelumiSourceMoves();

	const lines = [
		'=== Moves learned in vanilla but removed from Relumi (per Pokemon) ===',
		'',
		`Vanilla species: ${Object.keys(vanilla).length}`,
		`Compared (present in both files): ${comparedSpecies}`,
		`Skipped (no Relumi learnset): ${skippedSpecies} (${skippedCapSpecies} CAP, ${skippedSpecies - skippedCapSpecies} other)`,
		`Species with at least one missing move: ${affectedSpecies}`,
		`Distinct missing moves: ${sorted.length}`,
		`Filtered (egg move on first stage): ${filteredEggCount}`,
		'',
		'count\tmove',
	];
	for (const [moveId, count] of sorted) {
		const markers: string[] = [];
		if (tmMoves.has(moveId)) markers.push('TM');
		if (tutorMoves.has(moveId)) markers.push('Tutor');
		lines.push(`${count}\t${moveId}${markers.length ? ` (${markers.join(', ')})` : ''}`);
	}

	const outputPath = path.resolve(__dirname, 'missing-moves-by-count.txt');
	fs.writeFileSync(outputPath, lines.join('\n') + '\n', 'utf-8');
	console.log(`Output written to ${outputPath}`);
	console.log(`Distinct missing moves: ${sorted.length}`);
}

main();
