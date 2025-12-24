import axios from 'axios';
import { config } from './src/config';

async function checkRawTransactions() {
  console.log('=== Vérification des transactions brutes Billit ===\n');

  const axiosInstance = axios.create({
    baseURL: config.billit.apiUrl,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'apikey': config.billit.apiKey,
    },
  });

  if (config.billit.partyId) {
    axiosInstance.defaults.headers.common['partyID'] = config.billit.partyId;
  }

  try {
    // Récupérer les 20 dernières transactions de décembre
    const startDate = new Date(2025, 11, 1); // 1er décembre
    const endDate = new Date(2025, 11, 31, 23, 59, 59); // 31 décembre

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    const filter = `ValueDate ge DateTime'${startStr}' and ValueDate le DateTime'${endStr}'`;

    console.log('Période:', startStr, 'à', endStr);
    console.log('Filtre OData:', filter);
    console.log('');

    const params = {
      $top: 20,
      $filter: filter,
      $orderby: 'ValueDate desc',
    };

    console.log('🔍 Récupération des 20 dernières transactions de décembre...\n');

    const response = await axiosInstance.get('/v1/financialTransactions', { params });

    const items = response.data.Items || response.data.items || response.data || [];
    console.log(`✓ ${Array.isArray(items) ? items.length : 0} transactions récupérées\n`);

    if (Array.isArray(items) && items.length > 0) {
      // Afficher TOUS les champs de la première transaction
      console.log('📋 STRUCTURE COMPLÈTE de la première transaction:\n');
      console.log(JSON.stringify(items[0], null, 2));
      console.log('\n' + '='.repeat(80) + '\n');

      // Chercher Pluxee dans tous les champs
      console.log('🔍 Recherche de "plux" dans TOUTES les transactions...\n');

      const pluxeeFound: any[] = [];

      items.forEach((tx: any, idx: number) => {
        // Convertir l'objet entier en JSON et chercher "plux"
        const txJson = JSON.stringify(tx).toLowerCase();
        if (txJson.includes('plux')) {
          pluxeeFound.push({ index: idx, transaction: tx });
        }
      });

      if (pluxeeFound.length > 0) {
        console.log(`✅ ${pluxeeFound.length} transaction(s) contenant "plux" trouvée(s)!\n`);

        pluxeeFound.forEach(({ index, transaction }) => {
          console.log(`Transaction #${index + 1}:`);
          console.log('Champs principaux:');
          console.log('  - Note:', transaction.Note);
          console.log('  - Description:', transaction.Description);
          console.log('  - Communication:', transaction.Communication);
          console.log('  - CounterpartyName:', transaction.CounterpartyName);
          console.log('  - AccountName:', transaction.AccountName);
          console.log('  - Montant:', transaction.TotalAmount);
          console.log('  - Type:', transaction.TransactionType);
          console.log('  - Date:', transaction.ValueDate);
          console.log('\nObjet complet:');
          console.log(JSON.stringify(transaction, null, 2));
          console.log('\n' + '-'.repeat(80) + '\n');
        });
      } else {
        console.log('❌ Aucune transaction contenant "plux" trouvée\n');

        // Afficher les champs pertinents de toutes les transactions pour debug
        console.log('📋 Aperçu des 10 premières transactions:\n');
        items.slice(0, 10).forEach((tx: any, idx: number) => {
          console.log(`${idx + 1}. [${tx.TransactionType}] ${tx.ValueDate} - ${tx.TotalAmount} ${tx.Currency}`);
          console.log(`   Note: ${tx.Note || '(vide)'}`);
          console.log(`   Description: ${tx.Description || '(vide)'}`);
          console.log(`   Communication: ${tx.Communication || '(vide)'}`);
          console.log(`   CounterpartyName: ${tx.CounterpartyName || '(vide)'}`);
          console.log(`   AccountName: ${tx.AccountName || '(vide)'}`);
          console.log('');
        });
      }
    } else {
      console.log('❌ Aucune transaction récupérée');
    }

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

checkRawTransactions();
