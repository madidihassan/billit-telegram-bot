/**
 * Test pour vérifier le résumé simplifié avec fournisseur
 */

import { CommandHandler } from './src/command-handler';
import { BillitClient } from './src/billit-client';
import { BankClient } from './src/bank-client';

async function testSimplifiedSummary() {
  console.log('🧪 TEST RÉSUMÉ SIMPLIFIÉ - FOURNISSEUR\n');
  console.log('='.repeat(70));

  const billitClient = new BillitClient();
  const bankClient = new BankClient();
  const commandHandler = new CommandHandler(billitClient, bankClient);

  // Test 1: Transactions Foster en novembre (avec fournisseur = résumé simplifié)
  console.log('\n\n📋 TEST 1: Transactions Foster en novembre');
  console.log('Commande: transactions_periode ["2025-11-01", "2025-11-30", "Foster"]');
  console.log('-'.repeat(70));
  
  try {
    const result1 = await commandHandler.handleCommand('transactions_periode', ['2025-11-01', '2025-11-30', 'Foster']);
    console.log(result1);
  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }

  // Test 2: Toutes les transactions de novembre (sans fournisseur = résumé détaillé)
  console.log('\n\n' + '='.repeat(70));
  console.log('\n📋 TEST 2: Toutes les transactions de novembre');
  console.log('Commande: transactions_periode ["2025-11-01", "2025-11-30"]');
  console.log('-'.repeat(70));
  
  try {
    const result2 = await commandHandler.handleCommand('transactions_periode', ['2025-11-01', '2025-11-30']);
    console.log(result2);
  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }

  // Test 3: Transactions Foster en octobre
  console.log('\n\n' + '='.repeat(70));
  console.log('\n📋 TEST 3: Transactions Foster en octobre');
  console.log('Commande: transactions_periode ["2025-10-01", "2025-10-31", "Foster"]');
  console.log('-'.repeat(70));
  
  try {
    const result3 = await commandHandler.handleCommand('transactions_periode', ['2025-10-01', '2025-10-31', 'Foster']);
    console.log(result3);
  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }

  console.log('\n\n' + '='.repeat(70));
  console.log('✓ Tests terminés !');
}

testSimplifiedSummary().catch(console.error);
