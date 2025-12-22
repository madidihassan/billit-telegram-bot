import axios from 'axios';
import { config } from './src/config';

async function testAPI() {
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
    const response = await axiosInstance.get('/v1/financialTransactions', {
      params: {
        $top: 1000,
      },
    });
    console.log('✅ Succès:', response.data);
  } catch (error: any) {
    console.error('❌ Erreur 400 - Détails:');
    console.error('Status:', error.response?.status);
    console.error('StatusText:', error.response?.statusText);
    console.error('Data:', JSON.stringify(error.response?.data, null, 2));
    console.error('\nHeaders:', error.response?.headers);
  }
}

testAPI();
