#!/usr/bin/env node
"use strict";

/*
 * Generates data/relumi-egg-move-chains.js for the client: a precomputed map of
 * (species, egg move) -> all shortest breeding chains to obtain that egg move
 * (the string "unobtainable" marks an egg move with no known breeding route).
 *
 * The chain solver mirrors the server's egg-move mechanics:
 * - Fathers are gender-restricted (must be male-capable, i.e. not genderless or
 *   female-only), breedable, have a learnset, and not be a CAP/Custom/Past
 *   nonstandard. Battle-only forms (Megas, Gigantamax, etc.) cannot breed and
 *   are excluded as both sources and entries. Gen 9 species (flagged "Future")
 *   are legal in several Relumi formats and stay in the breeding graph.
 * - Offspring (targets and chain intermediates) are not gender-restricted,
 *   matching the server's egg-move father search; a chain intermediate must be
 *   male-capable so it can pass the move onward.
 * - A "natural source" is a species that learns the move via level-up ("L"),
 *   TM ("M"), or tutor ("T") in its OWN learnset; the reported level is the
 *   species' own level-up level (not a pre-evolution's). Egg moves ("E")
 *   require breeding, and a species that only inherits a move from its
 *   pre-evolution is reached through the breed graph instead.
 * - Moves a target also learns via level-up/TM/tutor in its own learnset are
 *   skipped, since the badge already shows that method.
 * - When several members of one evolution family could be the source, only the
 *   earliest (base) form is kept (e.g. Lickitung over Lickilicky, and a single
 *   representative of the Slowpoke line instead of Slowbro + Slowking).
 * - Smeargle is a fallback for Field-group targets when no natural chain exists.
 *
 * Runs after `node build` (needs dist/sim/dex) and reads the generated
 * data/mods/gen8relumi/learnsets.ts for the target species set.
 */

const fs = require("fs");
const path = require("path");
const { Dex, toID } = require("../dist/sim/dex");
const { getRelumiRepoRoot } = require("./lib/relumi-paths");
const { parseExportedObject } = require("./lib/relumi-parse-exported-object");

const ROOT = getRelumiRepoRoot();
const CLIENT_PLAY_DIR = path.resolve(
	ROOT,
	"..",
	"pokemon-showdown-client",
	"play.pokemonshowdown.com"
);
const MOD_LEARNSETS_PATH = path.join(ROOT, "data", "mods", "gen8relumi", "learnsets.ts");
const OUT_PATH = path.join(CLIENT_PLAY_DIR, "data", "relumi-egg-move-chains.js");

const DIRECT_SOURCE_TYPES = new Set(["L", "M", "T"]);
const METHOD_RANK = { L: 0, M: 1, T: 2 };
// Nonstandard kinds that are not part of the Relumi roster. Gen 9 species are
// flagged "Future" but are legal in several Relumi formats, so they stay in
// the breeding graph.
const EXCLUDED_NONSTANDARD = new Set(["CAP", "Custom", "Past"]);

/** True when source `a` is preferable to display over source `b`. */
function betterSource(a, b) {
	const ra = METHOD_RANK[a.charAt(1)] ?? 99;
	const rb = METHOD_RANK[b.charAt(1)] ?? 99;
	if (ra !== rb) return ra < rb;
	if (a.charAt(1) === "L" && b.charAt(1) === "L") {
		return (parseInt(a.slice(2)) || 0) < (parseInt(b.slice(2)) || 0);
	}
	return false;
}

/** Pick the best direct (L/M/T) source out of one learnset entry's sources. */
function bestDirectSource(sources) {
	let best = null;
	for (const src of sources) {
		if (!DIRECT_SOURCE_TYPES.has(src.charAt(1))) continue;
		if (!best || betterSource(src, best)) best = src;
	}
	return best;
}

/** Convert a raw source code like "9L25"/"9M"/"9T" to {m, l}. */
function describeMethod(src) {
	const type = src.charAt(1);
	if (type === "L") return { m: "level", l: parseInt(src.slice(2)) || 1 };
	if (type === "M") return { m: "tm" };
	if (type === "T") return { m: "tutor" };
	return { m: "other" };
}

/** True for formes that only exist in battle (Megas, Gigantamax, etc.). */
function isBattleOnlyForm(s) {
	// `battleOnly` covers Megas and other in-battle formes; this mod's
	// Gigantamax formes are only flagged via their "Gmax" forme name.
	return !!s.battleOnly || s.forme === "Gmax";
}

function main() {
	const dex = Dex.mod("gen8relumi");
	const speciesTable = dex.species;

	// 1. Build the set of breedable "node" species over which the breeding
	//    graph is defined.
	const nodes = [];
	const nodeIds = new Set();
	const fathers = new Set();
	for (const s of speciesTable.all()) {
		if (!s.exists) continue;
		if (EXCLUDED_NONSTANDARD.has(s.isNonstandard)) continue;
		if (s.id === "ditto") continue; // genderless; cannot pass egg moves
		if (isBattleOnlyForm(s)) continue; // battle-only forms cannot breed
		if (!s.eggGroups.length || s.eggGroups[0] === "Undiscovered") continue;
		if (!speciesTable.getLearnsetData(s.id).learnset) continue;
		nodes.push(s);
		nodeIds.add(s.id);
		// Only fathers are gender-restricted (must be male-capable).
		if (s.gender !== "N" && s.gender !== "F") fathers.add(s.id);
	}

	// 2. Egg-group membership over all node species.
	const membersByGroup = new Map();
	for (const s of nodes) {
		for (const g of s.eggGroups) {
			if (!membersByGroup.has(g)) membersByGroup.set(g, []);
			membersByGroup.get(g).push(s.id);
		}
	}

	// 3. Precompute, per father, the species that share an egg group with it
	//    (the BFS adjacency).
	const offspringNeighbors = new Map();
	for (const s of nodes) {
		if (!fathers.has(s.id)) continue;
		const set = new Set();
		for (const g of s.eggGroups) {
			for (const a of membersByGroup.get(g) || []) {
				if (a !== s.id) set.add(a);
			}
		}
		offspringNeighbors.set(s.id, Array.from(set));
	}

	// 4. Natural sources: fathers that learn the move via level-up/TM/tutor in
	//    their OWN learnset. Pre-evolution moves are intentionally excluded so
	//    the reported level is the father's own (e.g. Bibarel learns Amnesia at
	//    Lv. 38, not Bidoof's Lv. 32); a species that only inherits a move from
	//    its pre-evolution is reached through the breed graph instead.
	const naturalByFatherMove = new Map();
	const sourcesByMove = new Map();
	for (const s of nodes) {
		if (!fathers.has(s.id)) continue;
		const ownLearnset = speciesTable.getLearnsetData(s.id).learnset || {};
		for (const [moveId, sources] of Object.entries(ownLearnset)) {
			const best = bestDirectSource(sources);
			if (!best) continue;
			naturalByFatherMove.set(`${s.id}|${moveId}`, describeMethod(best));
			if (!sourcesByMove.has(moveId)) sourcesByMove.set(moveId, new Set());
			sourcesByMove.get(moveId).add(s.id);
		}
	}

	// 5. Targets are the species in the generated mod learnsets table (the
	//    same set the client shows "Egg" badges for). A move is shown when it
	//    is an egg move (own or pre-evolution learnset) AND the target does not
	//    also learn it via level-up/TM/tutor in its own learnset (that method
	//    is already shown in the badge).
	const targetIds = Object.keys(
		parseExportedObject(MOD_LEARNSETS_PATH, "Learnsets")
	).sort();
	const targetInfoCache = new Map();
	function getTargetInfo(sid) {
		if (targetInfoCache.has(sid)) return targetInfoCache.get(sid);
		const ownNatural = new Set();
		const ownLearnset = speciesTable.getLearnsetData(sid).learnset || {};
		for (const [moveId, sources] of Object.entries(ownLearnset)) {
			if (bestDirectSource(sources)) ownNatural.add(moveId);
		}
		const eggMoves = new Set();
		for (const entry of speciesTable.getFullLearnset(sid)) {
			for (const [moveId, sources] of Object.entries(entry.learnset)) {
				if (sources.some(src => src.charAt(1) === "E")) eggMoves.add(moveId);
			}
		}
		const info = { ownNatural, eggMoves };
		targetInfoCache.set(sid, info);
		return info;
	}

	// Collect (move -> targets) so each move's BFS runs once.
	const targetsByMove = new Map();
	for (const sid of targetIds) {
		const s = speciesTable.get(sid);
		if (!s.exists) continue;
		if (isBattleOnlyForm(s)) continue; // battle-only forms are never bred, so no entries
		const info = getTargetInfo(sid);
		for (const moveId of info.eggMoves) {
			if (info.ownNatural.has(moveId)) continue;
			if (!targetsByMove.has(moveId)) targetsByMove.set(moveId, []);
			targetsByMove.get(moveId).push(sid);
		}
	}

	// The species actually bred for a target. Undiscovered babies (e.g. Pichu)
	// are produced by breeding their evolution; cosmetic/event forms breed as
	// their base species; and the unbreadable Nidorina/Nidoqueen/Shedinja egg
	// moves are bred via their pre-evolution (matching the server validator).
	function breedForm(s) {
		let cur = s;
		if (cur.id === "nidoqueen" || cur.id === "nidorina") cur = speciesTable.get("nidoranf");
		else if (cur.id === "shedinja") cur = speciesTable.get("nincada");
		if (!nodeIds.has(cur.id) && cur.baseSpecies) {
			const base = speciesTable.get(toID(cur.baseSpecies));
			if (base.exists && base.id !== cur.id) cur = base;
		}
		if (cur.eggGroups[0] === "Undiscovered" && cur.evos.length) {
			cur = speciesTable.get(cur.evos[0]);
		}
		return cur;
	}

	const smeargle = speciesTable.get("smeargle");
	const smeargleOk = smeargle.exists && !smeargle.isNonstandard;

	// Return { root, depth } for a species' evolution family: `root` is the
	// base (unevolved) form and `depth` is how many pre-evolutions separate the
	// species from it. Used to dedupe routes that pick different members of the
	// same family as the natural source (e.g. Slowbro and Slowking).
	function getLineInfo(sid) {
		let cur = speciesTable.get(sid);
		let depth = 0;
		const seen = new Set();
		while (cur.exists && !seen.has(cur.id)) {
			seen.add(cur.id);
			if (!cur.prevo) break;
			cur = speciesTable.get(toID(cur.prevo));
			depth++;
		}
		return { root: cur.id, depth };
	}

	// 6. Run one multi-parent BFS per move, then resolve each target into all of
	//    its alternative shortest chains.
	const chains = {};
	const stats = { entries: 0, totalRoutes: 0, direct: 0, chained: 0, smeargle: 0, skipped: 0 };
	for (const [moveId, targetList] of targetsByMove) {
		const sources = sourcesByMove.get(moveId);
		const dist = new Map();
		const parents = new Map();
		if (sources) {
			const queue = [];
			for (const sid of sources) {
				dist.set(sid, 0);
				queue.push(sid);
			}
			for (let qi = 0; qi < queue.length; qi++) {
				const b = queue[qi];
				for (const a of offspringNeighbors.get(b) || []) {
					if (!dist.has(a)) {
						dist.set(a, dist.get(b) + 1);
						parents.set(a, [b]);
						if (fathers.has(a)) queue.push(a);
					} else if (dist.get(a) === dist.get(b) + 1) {
						parents.get(a).push(b);
					}
				}
			}
		}

		for (const tid of targetList) {
			const ts = speciesTable.get(tid);
			const bf = breedForm(ts);
			const bfBreedable = bf.exists && nodeIds.has(bf.id);

			if (!bfBreedable || !dist.has(bf.id)) {
				if (bfBreedable && bf.eggGroups.includes("Field") && smeargleOk) {
					chains[`${tid}|${moveId}`] = [{ s: ["smeargle"], m: "sketch" }];
					stats.smeargle++;
				} else {
					// "unobtainable" marks an egg move with no known breeding route.
					chains[`${tid}|${moveId}`] = "unobtainable";
					stats.skipped++;
				}
				continue;
			}

			const found = collectShortestChains(bf.id, dist, parents);
			if (!found.length) {
				chains[`${tid}|${moveId}`] = "unobtainable";
				stats.skipped++;
				continue;
			}
			// Prefer level-up routes (lower level first), then TM, then tutor,
			// then alphabetically for a deterministic output.
			found.sort((a, b) => compareChains(a, b, moveId, naturalByFatherMove));
			// Dedupe routes whose natural source is in the same evolution family:
			// keep only the earliest (base) form per family, so e.g. Lickitung is
			// shown instead of Lickilicky, and Slowbro/Slowking collapse to one.
			const minDepthByRoot = new Map();
			for (const chain of found) {
				const src = chain[chain.length - 1];
				const { root, depth } = getLineInfo(src);
				if (!minDepthByRoot.has(root) || depth < minDepthByRoot.get(root)) {
					minDepthByRoot.set(root, depth);
				}
			}
			const keptRoots = new Set();
			const distinct = [];
			for (const chain of found) {
				const src = chain[chain.length - 1];
				const { root, depth } = getLineInfo(src);
				if (depth !== minDepthByRoot.get(root)) continue;
				if (keptRoots.has(root)) continue;
				keptRoots.add(root);
				distinct.push(chain);
			}
			const routes = distinct.map(steps => ({
				s: steps,
				...(naturalByFatherMove.get(`${steps[steps.length - 1]}|${moveId}`) || { m: "level", l: 1 }),
			}));
			chains[`${tid}|${moveId}`] = routes;
			stats.entries++;
			stats.totalRoutes += routes.length;
			if (routes.every(route => route.s.length === 1)) stats.direct++;
			else stats.chained++;
		}
	}

	// Emit with sorted keys for a deterministic output.
	const sortedChains = {};
	for (const key of Object.keys(chains).sort()) sortedChains[key] = chains[key];

	const text =
		"// DO NOT EDIT - generated by scripts/generate-relumi-egg-move-chains.js\n\n" +
		`exports.BattleEggMoveChains = ${JSON.stringify(sortedChains)};\n`;

	fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
	fs.writeFileSync(OUT_PATH, text, "utf8");

	console.log("Generated Relumi egg move chains:");
	console.log(`- ${path.relative(ROOT, OUT_PATH)}`);
	console.log(`- Entries (species+moves): ${stats.entries}`);
	console.log(`- Total routes: ${stats.totalRoutes}`);
	console.log(`- Direct (single father): ${stats.direct}`);
	console.log(`- Chained (multi-step): ${stats.chained}`);
	console.log(`- Smeargle fallback: ${stats.smeargle}`);
	console.log(`- No route (skipped): ${stats.skipped}`);
}

/** Enumerate all distinct shortest chains from `startId` to sources. */
function collectShortestChains(startId, dist, parents) {
	// A source itself is a one-step chain (breed it directly as the father),
	// rather than an empty chain that the client would render incorrectly.
	if (dist.get(startId) === 0) return [[startId]];
	const results = [];
	const path = [];
	function dfs(node) {
		if (dist.get(node) === 0) {
			results.push(path.slice());
			return;
		}
		for (const p of parents.get(node) || []) {
			path.push(p);
			dfs(p);
			path.pop();
		}
	}
	dfs(startId);
	return results;
}

/** Compare two chains so easier routes sort first. */
function compareChains(a, b, moveId, naturalByFatherMove) {
	if (a.length !== b.length) return a.length - b.length;
	const aSrc = a[a.length - 1];
	const bSrc = b[b.length - 1];
	const aMethod = naturalByFatherMove.get(`${aSrc}|${moveId}`);
	const bMethod = naturalByFatherMove.get(`${bSrc}|${moveId}`);
	const aRank = aMethod ? (aMethod.m === "level" ? 0 : aMethod.m === "tm" ? 1 : 2) : 3;
	const bRank = bMethod ? (bMethod.m === "level" ? 0 : bMethod.m === "tm" ? 1 : 2) : 3;
	if (aRank !== bRank) return aRank - bRank;
	const aLevel = aMethod && aMethod.l ? aMethod.l : 999;
	const bLevel = bMethod && bMethod.l ? bMethod.l : 999;
	if (aLevel !== bLevel) return aLevel - bLevel;
	if (aSrc !== bSrc) return aSrc < bSrc ? -1 : 1;
	return a.join("|").localeCompare(b.join("|"));
}

try {
	main();
} catch (err) {
	console.error(err);
	process.exit(1);
}
