/**
 * Test d'extraction KBC
 */

import { SupplierLearningService } from './src/supplier-learning-service';

async function testKBC() {
  const learningService = new SupplierLearningService();

  const description = "RECOUVREMENT EUROPÉEN KBC BANK NV 0001 0001 BE 2504053277TONTON 202 SRL";

  console.log('🔍 Test d\'extraction KBC\n');
  console.log(`Description: "${description}"\n`);

  const extracted = learningService.extractSupplierFromDescription(description);

  console.log(`Fournisseur extrait: ${extracted || '❌ Aucun'}\n`);

  // Tester différents patterns manuellement
  console.log('🧪 Test des patterns manuellement:\n');

  // Pattern 3 actuel
  const pattern3 = /^([A-Z]{2,}(?:\s+[A-Z]{2,})+(?:\s+SA|NV|Bureau|SPRL|Ltd)+)/;
  const match3 = description.match(pattern3);
  console.log(`Pattern 3: ${match3 ? match3[1] : '❌ Aucun match'}`);

  // Nouveau Pattern 4: chercher après "RECOUVREMENT" ou "SEPA" ou similaire
  const pattern4 = /^(?:RECOUVREMENT|VIREMENT|PRELEVEMENT|DOMICILIATION)\s+(?:EUROP[EÉ]EN\s+)?(?:SEPA\s+)?([A-Z][A-Za-z0-9&\s\.]+?)(?:\s+\d{4,}|$)/;
  const match4 = description.match(pattern4);
  console.log(`Pattern 4: ${match4 ? match4[1] : '❌ Aucun match'}`);

  // Pattern plus simple: extraire KBC BANK NV
  const pattern5 = /\b([A-Z]{2,}(?:\s+[A-Z]{2,})+)\b/;
  const matches5 = description.match(pattern5);
  console.log(`Pattern 5 (tous les groupes en majuscules): ${matches5 ? matches5.join(', ') : '❌ Aucun'}`);

  process.exit(0);
}

testKBC();
