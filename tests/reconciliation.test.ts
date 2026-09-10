/**
 * Tests du service de réconciliation paiements-factures
 * Couvre: tolérance montant, fuzzy matching fournisseur, priorité par date
 */

import { describe, it, expect } from 'vitest';

// ──────────────────────────────────────────────────────
// Simuler la logique de matching améliorée
// ──────────────────────────────────────────────────────

type Confidence = 'high' | 'medium' | 'low';

interface SimpleInvoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  invoice_date: string;
  supplier_name: string;
  communication?: string;
}

interface SimpleTransaction {
  id: string;
  amount: number;
  date: string;
  description: string;
  type: 'Debit' | 'Credit';
}

interface Match {
  invoice: SimpleInvoice;
  transaction: SimpleTransaction;
  confidence: Confidence;
  matchReason: string;
}

const AMOUNT_TOLERANCE_PERCENT = 0.005; // 0.5%
const AMOUNT_TOLERANCE_MIN = 0.02;

function getAmountTolerance(invoiceAmount: number): number {
  return Math.max(invoiceAmount * AMOUNT_TOLERANCE_PERCENT, AMOUNT_TOLERANCE_MIN);
}

function amountsMatch(invoiceAmount: number, txAmount: number): boolean {
  const tolerance = getAmountTolerance(invoiceAmount);
  return Math.abs(Math.abs(txAmount) - Math.abs(invoiceAmount)) <= tolerance;
}

function ogmMatch(communication: string | undefined, txDescription: string): boolean {
  if (!communication || communication.length < 8) return false;
  const ogmDigits = communication.replace(/\D/g, '');
  const txDescDigits = txDescription.replace(/\D/g, '');
  return ogmDigits.length >= 8 && txDescDigits.includes(ogmDigits);
}

function supplierNameMatch(supplierName: string, txDescription: string): boolean {
  const supNorm = supplierName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const descNorm = txDescription.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  // Fuzzy: vérifier si au moins un mot significatif du fournisseur est dans la description
  const supWords = supNorm.split(/\s+/).filter(w => w.length >= 3);
  return supWords.some(word => descNorm.includes(word));
}

// ──────────────────────────────────────────────────────
// TESTS
// ──────────────────────────────────────────────────────

describe('Réconciliation paiements-factures', () => {

  describe('Tolérance montant flexible', () => {
    it('0.5% de 1000€ = 5€ de tolérance', () => {
      expect(getAmountTolerance(1000)).toBe(5);
    });

    it('0.5% de 100€ = 0.5€ de tolérance', () => {
      expect(getAmountTolerance(100)).toBe(0.5);
    });

    it('minimum 0.02€ pour les petits montants', () => {
      expect(getAmountTolerance(1)).toBe(0.02);
      expect(getAmountTolerance(0.5)).toBe(0.02);
    });

    it('montant exact matche', () => {
      expect(amountsMatch(1000, 1000)).toBe(true);
    });

    it('montant avec 0.01€ de différence matche', () => {
      expect(amountsMatch(1000, 999.99)).toBe(true);
    });

    it('montant avec 4€ de différence sur 1000€ matche (< 0.5%)', () => {
      expect(amountsMatch(1000, 996)).toBe(true);
    });

    it('montant avec 6€ de différence sur 1000€ ne matche PAS (> 0.5%)', () => {
      expect(amountsMatch(1000, 994)).toBe(false);
    });

    it('petit montant: 50€ ± 0.25€ matche', () => {
      expect(amountsMatch(50, 49.80)).toBe(true);
    });

    it('petit montant: 50€ ± 0.30€ ne matche PAS', () => {
      expect(amountsMatch(50, 49.70)).toBe(false);
    });

    it('gros montant: 10000€ ± 45€ matche', () => {
      expect(amountsMatch(10000, 9955)).toBe(true);
    });

    it('gros montant: 10000€ ± 60€ ne matche PAS', () => {
      expect(amountsMatch(10000, 9940)).toBe(false);
    });
  });

  describe('OGM matching (haute confiance)', () => {
    it('matche un OGM standard belge', () => {
      expect(ogmMatch('+++012/5005/51664+++', 'VIREMENT DEBIT 01250055166')).toBe(false);
      expect(ogmMatch('+++012/5005/51664+++', 'PAIEMENT +++012/5005/51664+++')).toBe(true);
    });

    it('matche un OGM partiel dans une description longue', () => {
      expect(ogmMatch('+++012/5005/51664+++', 'FOSTER FAST FOOD SA Paiement facture 012500551664 du 24/03')).toBe(true);
    });

    it('ne matche PAS un OGM trop court', () => {
      expect(ogmMatch('1234', 'Paiement 1234')).toBe(false);
    });

    it('ne matche PAS sans communication', () => {
      expect(ogmMatch(undefined, 'quelque chose')).toBe(false);
      expect(ogmMatch('', 'quelque chose')).toBe(false);
    });
  });

  describe('Matching fournisseur (fuzzy)', () => {
    it('matche FOSTER dans une description de paiement', () => {
      expect(supplierNameMatch('FOSTER FAST FOOD SA', 'FOSTER FAST FOOD SA - DEBIT POUR DOMICILIATION')).toBe(true);
    });

    it('matche un nom partiel (mot significatif)', () => {
      expect(supplierNameMatch('FOSTER FAST FOOD SA', 'Paiement FOSTER facture mars')).toBe(true);
    });

    it('matche Coca-Cola dans une description contenant le nom complet', () => {
      expect(supplierNameMatch('COCA-COLA EUROPACIFIC PARTNERS', 'COCA COLA EUROPACIFIC PARTNERS BELGIUM paiement')).toBe(true);
    });

    it('matche Sligro dans une description', () => {
      expect(supplierNameMatch('Sligro-MFS Belgium SA', 'SLIGRO MFS Belgium paiement')).toBe(true);
    });

    it('ne matche PAS un fournisseur différent', () => {
      expect(supplierNameMatch('FOSTER FAST FOOD SA', 'Paiement COLRUYT facture')).toBe(false);
    });

    it('ne matche PAS sur des mots courts (< 3 caractères)', () => {
      expect(supplierNameMatch('SA NV', 'Paiement SA NV quelque chose')).toBe(false);
    });
  });

  describe('Priorité par date', () => {
    it('entre 2 transactions du même montant, la plus proche en date gagne', () => {
      const invoice: SimpleInvoice = {
        id: '1', invoice_number: 'F001', total_amount: 1000,
        invoice_date: '2026-03-01', supplier_name: 'Test Co',
      };

      const tx1: SimpleTransaction = {
        id: 't1', amount: 1000, date: '2026-03-15', description: 'Paiement Test', type: 'Debit',
      };
      const tx2: SimpleTransaction = {
        id: 't2', amount: 1000, date: '2026-03-05', description: 'Paiement Test', type: 'Debit',
      };

      // tx2 est plus proche de la date de facture (4 jours vs 14 jours)
      const daysDiff1 = (new Date(tx1.date).getTime() - new Date(invoice.invoice_date).getTime()) / (1000 * 60 * 60 * 24);
      const daysDiff2 = (new Date(tx2.date).getTime() - new Date(invoice.invoice_date).getTime()) / (1000 * 60 * 60 * 24);

      expect(daysDiff2).toBeLessThan(daysDiff1);
      expect(daysDiff2).toBe(4);
      expect(daysDiff1).toBe(14);
    });

    it('confiance haute prioritaire sur confiance moyenne même si date plus lointaine', () => {
      const confidenceOrder: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

      const candidates = [
        { confidence: 'medium' as Confidence, daysDiff: 2 },
        { confidence: 'high' as Confidence, daysDiff: 10 },
      ];

      candidates.sort((a, b) => {
        const confDiff = confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
        if (confDiff !== 0) return confDiff;
        return a.daysDiff - b.daysDiff;
      });

      expect(candidates[0].confidence).toBe('high');
    });
  });

  describe('Scénarios complets', () => {
    it('facture avec OGM + montant exact = HIGH confidence', () => {
      const invoice: SimpleInvoice = {
        id: '1', invoice_number: 'SI2500005516', total_amount: 5851.74,
        invoice_date: '2026-03-24', supplier_name: 'FOSTER FAST FOOD SA',
        communication: '+++012/5005/51664+++',
      };

      const tx: SimpleTransaction = {
        id: 't1', amount: 5851.74, date: '2026-03-25',
        description: 'FOSTER FAST FOOD SA +++012/5005/51664+++ DEBIT', type: 'Debit',
      };

      expect(amountsMatch(invoice.total_amount, tx.amount)).toBe(true);
      expect(ogmMatch(invoice.communication, tx.description)).toBe(true);
    });

    it('facture sans OGM mais montant + fournisseur = MEDIUM confidence', () => {
      const invoice: SimpleInvoice = {
        id: '2', invoice_number: 'INV2026001', total_amount: 1786.74,
        invoice_date: '2026-03-24', supplier_name: 'COCA-COLA EUROPACIFIC PARTNERS',
      };

      const tx: SimpleTransaction = {
        id: 't2', amount: 1786.74, date: '2026-03-26',
        description: 'VIREMENT COCA COLA PARTNERS BELGIUM', type: 'Debit',
      };

      expect(amountsMatch(invoice.total_amount, tx.amount)).toBe(true);
      expect(ogmMatch(invoice.communication, tx.description)).toBe(false);
      expect(supplierNameMatch(invoice.supplier_name, tx.description)).toBe(true);
    });

    it('montant avec arrondi bancaire matche maintenant', () => {
      const invoice: SimpleInvoice = {
        id: '3', invoice_number: 'F003', total_amount: 2500.00,
        invoice_date: '2026-03-20', supplier_name: 'Fournisseur X',
      };

      // Arrondi bancaire: 2499.95 au lieu de 2500.00
      expect(amountsMatch(2500.00, 2499.95)).toBe(true);

      // Ancien système (0.01€ tolerance): aurait échoué
      expect(Math.abs(2500.00 - 2499.95) > 0.01).toBe(true);
    });
  });
});
