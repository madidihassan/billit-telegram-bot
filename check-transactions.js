const axios = require('axios');
const config = require('./dist/config');

(async () => {
  try {
    const response = await axios.get(config.BILLIT_BANK_API_URL + '/v1/financialTransactions', {
      headers: { 'Subscription-Key': config.BILLIT_API_KEY },
      params: { $top: 120, $skip: 0 }
    });

    const items = response.data.Items || response.data.items || response.data || [];

    // Chercher les transactions contenant 'chami' ou 'tariq'
    const matches = items.filter(tx => {
      const desc = (tx.Description || '').toLowerCase();
      return desc.includes('chami') || desc.includes('tariq') || desc.includes('khalid') || desc.includes('kalide');
    });

    console.log('Transactions trouvées:', matches.length);
    matches.forEach(tx => {
      console.log(`- [${tx.ValueDate}] ${tx.Amount}€: ${tx.Description}`);
    });
  } catch (err) {
    console.error('Erreur:', err.message);
  }
})();
