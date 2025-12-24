const Groq = require('groq-sdk');
require('dotenv').config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function testIAPrompt() {
  const question = "Compare les recettes d'octobre et novembre";

  const prompt = `Tu es un assistant qui analyse des questions sur des factures et des transactions bancaires.

Ta tâche : Identifier quelle(s) commande(s) exécuter pour répondre à la question.

Commandes disponibles :
- transactions_periode [date1] [date2] [type?]: Transactions sur une période

Règles IMPORTANTES pour les dates :
- Mois: janvier=01, février=02, mars=03, avril=04, mai=05, juin=06, juillet=07, août=08, septembre=09, octobre=10, novembre=11, décembre=12
- Année actuelle: 2025
- Format date: YYYY-MM-DD (ex: 2025-10-01 pour 1er octobre 2025)
- Pour un mois complet: date de début = 1er jour, date de fin = dernier jour

Réponds au format JSON :
{
  "intent": "description",
  "commands": [
    {"command": "nom_commande", "args": ["arg1", "arg2"], "description": "pourquoi"}
  ]
}

Exemple :
"Compare les recettes d'octobre et novembre" → {"intent": "Comparer les recettes d'octobre et novembre 2025", "commands": [{"command": "transactions_periode", "args": ["2025-10-01", "2025-10-31", "recettes"], "description": "obtenir les recettes d'octobre 2025"}, {"command": "transactions_periode", "args": ["2025-11-01", "2025-11-30", "recettes"], "description": "obtenir les recettes de novembre 2025"}]}

Question de l'utilisateur : "${question}"

Réponds UNIQUEMENT avec le JSON, sans explication :`;

  console.log('🧪 Test du prompt IA');
  console.log('📝 Question:', question);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const completion = await groq.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    model: 'llama-3.1-8b-instant',
    temperature: 0.0,
    max_tokens: 300,
  });

  const response = completion.choices[0]?.message?.content || '';
  console.log('📝 Réponse brute de l\'IA:');
  console.log(response);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Essayer de parser
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('✅ JSON parsé avec succès:');
      console.log(JSON.stringify(parsed, null, 2));
    } else {
      console.log('❌ Pas de JSON trouvé dans la réponse');
    }
  } catch (error) {
    console.log('❌ Erreur de parsing JSON:', error.message);
  }
}

testIAPrompt().catch(console.error);
