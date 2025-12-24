const { normalizeSearchTerm, matchesSupplier } = require('./dist/supplier-aliases');

// Test avec la description réelle
const description = "N.V. Pluxee Belgium S.A.";
const normalized = normalizeSearchTerm(description);

console.log("Description originale:", description);
console.log("Description normalisée:", normalized);
console.log("");

// Test avec le fournisseur pluxee
const result = matchesSupplier(description, "pluxee");
console.log("Match avec 'pluxee':", result);
console.log("");

// Test avec différents termes
console.log("Tests de normalisation:");
console.log("- pluxee:", normalizeSearchTerm("pluxee"));
console.log("- \"pluxee:", normalizeSearchTerm("\"pluxee"));
console.log("- belgium\":", normalizeSearchTerm("belgium\""));
console.log("- pluxee belgium:", normalizeSearchTerm("pluxee belgium"));
