/**
 * Ajouter manuellement KBC à la base
 */

import { SupplierLearningService } from './src/supplier-learning-service';

async function learnKBC() {
  const learningService = new SupplierLearningService();

  const description = "RECOUVREMENT EUROPÉEN KBC BANK NV 0001 0001 BE 2504053277TONTON 202 SRL";

  console.log('🧑‍🎓 Apprentissage de KBC...\n');

  const learned = learningService.learnFromDescription(description);

  if (learned) {
    console.log('✅ KBC a été ajouté à la base de données !');
  } else {
    console.log('ℹ️  KBC existe déjà dans la base ou n\'a pas pu être extrait');
  }

  process.exit(0);
}

learnKBC();
