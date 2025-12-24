const { normalizeSearchTerm, matchesSupplier } = require('./dist/supplier-aliases');

// Test avec la description réelle des transactions
const descriptions = [
  "N.V. Pluxee Belgium S.A.",
  "N V Pluxee Belgium S A",
  "Pluxee Belgium",
  "NV Pluxee Belgium"
];

console.log("=== Test de matching pour Pluxee ===\n");

descriptions.forEach(desc => {
  const normalized = normalizeSearchTerm(desc);
  const matches = matchesSupplier(desc, "pluxee");
  console.log(`Description: "${desc}"`);
  console.log(`Normalisé: "${normalized}"`);
  console.log(`Match: ${matches ? "YES" : "NO"}`);
  console.log("");
});
