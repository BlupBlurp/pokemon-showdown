import RandomTeams from "../gen9/teams";

export class RandomRelumiTeams extends RandomTeams {
	override randomSets: {
		[species: string]: RandomTeamsTypes.RandomSpeciesData,
	} = require("./sets.json");
	override randomDoublesSets: {
		[species: string]: RandomTeamsTypes.RandomSpeciesData,
	} = require("./doubles-sets.json");
}

export default RandomRelumiTeams;
