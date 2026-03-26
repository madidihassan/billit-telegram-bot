/**
 * Tests de validation IBAN pour prévenir l'injection OData
 */

import { describe, it, expect } from 'vitest';

// Reproduire la logique de validation IBAN de bank-client.ts
function isValidIBAN(iban: string): boolean {
  const ibanClean = iban.replace(/\s/g, '');
  return /^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(ibanClean);
}

describe('Validation IBAN (protection injection OData)', () => {
  describe('IBAN valides', () => {
    it('accepte un IBAN belge standard', () => {
      expect(isValidIBAN('BE00000000000000')).toBe(true);
    });

    it('accepte un IBAN avec espaces', () => {
      expect(isValidIBAN('BE00 0000 0000 0000')).toBe(true);
    });

    it('accepte un IBAN allemand', () => {
      expect(isValidIBAN('DE89370400440532013000')).toBe(true);
    });

    it('accepte un IBAN français', () => {
      expect(isValidIBAN('FR7630006000011234567890189')).toBe(true);
    });

    it('accepte un IBAN néerlandais', () => {
      expect(isValidIBAN('NL91ABNA0417164300')).toBe(true);
    });
  });

  describe('Tentatives d injection OData', () => {
    it('rejette une injection avec guillemets simples', () => {
      expect(isValidIBAN("' or 1 eq 1 or IBAN eq '")).toBe(false);
    });

    it('rejette une injection avec parenthèses', () => {
      expect(isValidIBAN("BE00) or (1 eq 1")).toBe(false);
    });

    it('rejette une injection avec opérateurs OData', () => {
      expect(isValidIBAN("BE00' and 1 eq 1 and IBAN eq '")).toBe(false);
    });

    it('rejette du texte libre', () => {
      expect(isValidIBAN('DROP TABLE bankaccounts')).toBe(false);
    });

    it('rejette un IBAN avec caractères spéciaux', () => {
      expect(isValidIBAN('BE00;DELETE')).toBe(false);
    });

    it('rejette un IBAN vide', () => {
      expect(isValidIBAN('')).toBe(false);
    });

    it('rejette un IBAN trop court (juste le code pays)', () => {
      expect(isValidIBAN('BE')).toBe(false);
    });

    it('rejette un IBAN en minuscules', () => {
      expect(isValidIBAN('be00000000000000')).toBe(false);
    });

    it('rejette des chiffres seuls', () => {
      expect(isValidIBAN('1234567890')).toBe(false);
    });

    it('rejette un IBAN commençant par des chiffres', () => {
      expect(isValidIBAN('00BE000000000000')).toBe(false);
    });
  });
});
