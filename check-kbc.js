const db = require('better-sqlite3')('data/billit.db');

// Chercher KBC
const suppliers = db.prepare('SELECT * FROM suppliers WHERE name LIKE ?').all('%KBC%');

console.log('=== Fournisseurs avec KBC ===');
suppliers.forEach(s => {
  console.log(`ID: ${s.id}, Name: ${s.name}, Type: ${s.type}`);

  // Récupérer les alias
  const aliases = db.prepare('SELECT alias FROM supplier_aliases WHERE supplier_id = ?').all(s.id);
  console.log('Alias:', aliases.map(a => a.alias).join(', '));
  console.log('');
});

console.log('Total:', suppliers.length, 'fournisseur(s) trouvé(s)');
