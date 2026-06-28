/**
 * Luminescent URL builders
 *
 * Shared module for building luminescent.team URLs, used by both
 * server/chat.ts (Chat helpers) and server/chat-formatter.ts (wiki link formatting).
 *
 * Form index logic shared with scripts/lib/relumi-form-index.js.
 */

// These globals are available server-side at runtime.
declare const Config: AnyObject;
declare const Dex: any;
declare const toID: (text: any) => string;

const { computeFormIndex: computeFormIndexShared, buildFormIndexMap: buildFormIndexMapShared } =
	require('../../scripts/lib/relumi-form-index');

// Cache per Dex instance so we don't rebuild on every URL call
const formIndexCache = new WeakMap();

function computeFormIndex(species: { id: string; baseSpecies?: string; forme?: string; name: string }): number | undefined {
	if (!species.baseSpecies || !species.forme || species.baseSpecies === species.name) {
		return undefined;
	}

	if (!formIndexCache.has(Dex)) {
		formIndexCache.set(Dex, buildFormIndexMapShared(Dex, toID));
	}
	const map = formIndexCache.get(Dex)!;
	return (map as Record<string, number>)[species.id];
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
