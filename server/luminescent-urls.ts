/**
 * Luminescent URL builders
 *
 * Shared module for building luminescent.team URLs, used by both
 * server/chat.ts (Chat helpers) and server/chat-formatter.ts (wiki link formatting).
 *
 * Form index logic mirrors buildFormIndexMap in scripts/export-relumi-client-overrides.js:
 * base=0, formeOrder[1+]=1..n, Gmax=n, custom forms=n+1.. (sorted alphabetically).
 *
 * Computes indices on-the-fly using each species' own Dex context (via its base
 * species' formeOrder/otherFormes) rather than a global cache, since the caller's
 * Dex may differ from the global Dex (e.g. gen8relumi vs gen9).
 */

// These globals are available server-side at runtime.
declare const Config: AnyObject;
declare const Dex: any;
declare const toID: (text: any) => string;

/**
 * Compute the Luminescent Pokédex form index for a species.
 *
 * Index scheme (per species family):
 *   base species    → 0   (URL uses species.id, not num_0)
 *   formeOrder[1+]  → 1..n
 *   Gmax form       → formeOrder.length
 *   custom forms    → formeOrder.length+1.. (sorted alphabetically)
 */
function computeFormIndex(species: { id: string; baseSpecies?: string; forme?: string; name: string }): number | undefined {
	// Base species (no forme, or name matches base) → index 0
	if (!species.baseSpecies || !species.forme || species.baseSpecies === species.name) {
		return undefined;
	}

	const base = Dex.species.get(species.baseSpecies);
	if (!base.exists) return undefined;

	const formeOrder: string[] = (base).formeOrder || [base.name];
	const foIDs: string[] = formeOrder.map((f: string) => toID(f));

	// Check formeOrder (Megas and other official formes)
	const fi = foIDs.indexOf(species.id);
	if (fi >= 0) return fi;

	// Check Gmax (always at formeOrder.length, before custom forms)
	const gmaxId = toID(species.baseSpecies) + 'gmax';
	const hasGmax = Dex.species.get(gmaxId).exists;
	if (species.id === gmaxId || (species.id.endsWith('gmax') && hasGmax)) {
		return formeOrder.length;
	}

	// Custom forms after Gmax, sorted alphabetically among themselves.
	// Uses base.otherFormes to enumerate custom/mod forms. This covers Relumi
	// custom forms (Clone variants, Smeargle recolors, etc.) in the gen8relumi mod.
	const otherIDs: string[] = (base.otherFormes || [])
		.map((f: string) => toID(f))
		.filter((f: string) => !foIDs.includes(f) && !f.endsWith('gmax'));
	otherIDs.sort();

	const offset = hasGmax ? formeOrder.length + 1 : formeOrder.length;
	const oi = otherIDs.indexOf(species.id);
	return offset + Math.max(0, oi);
}

export function getLuminescentPokemonUrl(speciesOrId: { id: string; num: number; name: string; exists: boolean; baseSpecies?: string; forme?: string } | string): string {
	const species = typeof speciesOrId === 'string' ? Dex.species.get(speciesOrId) : speciesOrId;
	if (!species.exists) return '#';

	const formIndex = computeFormIndex(species);
	if (formIndex !== undefined && formIndex > 0) {
		return `https://${Config.routes.dex}/pokedex/${species.num}_${formIndex}`;
	}
	return `https://${Config.routes.dex}/pokedex/${species.id}`;
}

export function getLuminescentMoveUrl(nameOrId: string): string {
	const move = Dex.moves.get(nameOrId);
	if (!move.exists) return '#';
	// Luminescent uses lowercase-with-hyphens: "Karate Chop" -> "karate-chop"
	const slug = move.name.toLowerCase().replace(/\s+/g, '-');
	return `https://${Config.routes.dex}/moves/${slug}`;
}

export function getLuminescentAbilityUrl(_nameOrId?: string): string {
	// Placeholder: luminescent.team has no ability pages yet.
	return '#';
}

export function getLuminescentItemUrl(nameOrId?: string): string {
	if (!nameOrId) return '#';
	const item = Dex.items.get(nameOrId);
	if (!item.exists) return '#';
	// Luminescent uses lowercase-with-hyphens: "Leftovers" -> "leftovers"
	const slug = item.name.toLowerCase().replace(/\s+/g, '-');
	return `https://${Config.routes.dex}/items/${slug}`;
}
