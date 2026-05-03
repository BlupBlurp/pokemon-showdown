"use strict";
const {Dex} = require('./dist/sim/dex');
const dex = Dex.mod('gen8relumi');

// Check validation issues
const tests = ['Minior-Yellow', 'Magikarp-V16', 'Arbok-V1', 'Smeargle-Red', 'Minior', 'Magikarp'];
for (const name of tests) {
    const s = dex.species.get(name);
    console.log(`${name}: exists=${s.exists}, isCosmeticForme=${s.isCosmeticForme}, abilities[0]=${s.abilities['0']}`);
}
const minior = dex.species.get('Minior');
console.log('Minior cosmeticFormes:', JSON.stringify(minior.cosmeticFormes));
