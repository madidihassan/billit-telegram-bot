const { SUPPLIER_ALIASES } = require('./dist/supplier-aliases');

const EMPLOYEE_KEYS = [
  'kalidechami', 'zamounlamya', 'elbarnoussi', 'krimfatima', 'mahjoub',
  'eljaouhari', 'azzabi', 'aboukhalid', 'elbalghiti', 'ourimchi',
  'benyamoune', 'kharbouche', 'afkir', 'ellalouimohamed', 'madidijawad',
  'samat', 'barilyagoubi', 'taglina', 'turbatu', 'qibouz', 'mrabet',
  'madidihassan', 'elmouden', 'satti', 'jamhounmokhlis'
];

const all = Object.entries(SUPPLIER_ALIASES);
const suppliers = all.filter(([key]) => !EMPLOYEE_KEYS.includes(key));

console.log('═══════════════════════════════════════');
console.log('📊 Statistiques du filtrage');
console.log('═══════════════════════════════════════');
console.log('Total entrées dans supplier-aliases.json:', all.length);
console.log('Nombre d\'employés à filtrer:', EMPLOYEE_KEYS.length);
console.log('Fournisseurs restants (après filtrage):', suppliers.length);
console.log('Entrées filtrées:', all.length - suppliers.length);
console.log('═══════════════════════════════════════');

// Vérifier quels employés sont dans le fichier
const employeesInFile = EMPLOYEE_KEYS.filter(key => SUPPLIER_ALIASES[key]);
console.log('\nEmployés trouvés dans le fichier:', employeesInFile.length);
console.log('Employés manquants:', EMPLOYEE_KEYS.length - employeesInFile.length);
