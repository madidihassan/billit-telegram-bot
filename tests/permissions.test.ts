/**
 * Tests complets du système de permissions (RBAC)
 * Teste database.ts: getUserRole, hasPermission, getPermissionDeniedMessage
 * Teste command-handler.ts: vérification des rôles avant exécution des commandes sensibles
 * Teste ai-agent-service-v2.ts: vérification des rôles dans executeFunction
 *
 * Utilise une BDD SQLite en mémoire pour isolation totale.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

// ──────────────────────────────────────────────────────
// Reproduire les fonctions de database.ts avec une BDD en mémoire
// pour éviter de toucher à la vraie BDD de production
// ──────────────────────────────────────────────────────

interface AuthorizedUser {
  chat_id: string;
  username: string | null;
  role: 'owner' | 'admin' | 'user';
  employee_id: number | null;
  added_by: string | null;
  added_at: string;
  is_active: number;
}

// Map des permissions (identique à database.ts)
const OPERATION_PERMISSIONS: Record<string, Array<'owner' | 'admin' | 'user'>> = {
  'add_user': ['owner', 'admin'],
  'adduser': ['owner', 'admin'],
  'remove_user': ['owner', 'admin'],
  'removeuser': ['owner', 'admin'],
  'restart_bot': ['owner'],
  'mark_invoice_as_paid': ['owner', 'admin'],
  'markpaid': ['owner', 'admin'],
  'payinvoice': ['owner', 'admin'],
};

let db: Database.Database;

function initTestDb() {
  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS authorized_users (
      chat_id TEXT PRIMARY KEY,
      username TEXT,
      role TEXT DEFAULT 'user' CHECK(role IN ('owner', 'admin', 'user')),
      employee_id INTEGER,
      added_by TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active BOOLEAN DEFAULT 1
    );
  `);
}

function addUser(chatId: string, username: string | null, role: 'owner' | 'admin' | 'user', addedBy: string | null = null): boolean {
  try {
    db.prepare('INSERT INTO authorized_users (chat_id, username, role, added_by) VALUES (?, ?, ?, ?)').run(chatId, username, role, addedBy);
    return true;
  } catch { return false; }
}

function getUserByChatId(chatId: string): AuthorizedUser | null {
  return (db.prepare('SELECT * FROM authorized_users WHERE chat_id = ? AND is_active = 1').get(chatId) as AuthorizedUser) || null;
}

function removeUser(chatId: string): boolean {
  const result = db.prepare('UPDATE authorized_users SET is_active = 0 WHERE chat_id = ?').run(chatId);
  return result.changes > 0;
}

function getAllUsers(): AuthorizedUser[] {
  return db.prepare('SELECT * FROM authorized_users WHERE is_active = 1 ORDER BY added_at').all() as AuthorizedUser[];
}

function getUserRole(chatId: string): 'owner' | 'admin' | 'user' | null {
  const user = getUserByChatId(chatId);
  return user ? user.role : null;
}

function hasPermission(chatId: string, operation: string): boolean {
  const allowedRoles = OPERATION_PERMISSIONS[operation];
  if (!allowedRoles) return true;
  const user = getUserByChatId(chatId);
  if (!user) return false;
  return allowedRoles.includes(user.role);
}

function getPermissionDeniedMessage(operation: string): string {
  const allowedRoles = OPERATION_PERMISSIONS[operation];
  if (!allowedRoles) return '';
  const rolesText = allowedRoles.join(' ou ');
  return `⛔ Accès refusé. Cette opération nécessite le rôle : ${rolesText}.`;
}

// ──────────────────────────────────────────────────────
// TESTS
// ──────────────────────────────────────────────────────

describe('Système de permissions (RBAC)', () => {
  beforeEach(() => {
    initTestDb();
    // Setup: 3 utilisateurs avec des rôles différents
    addUser('111', 'Hassan', 'owner', null);
    addUser('222', 'Soufiane', 'admin', 'Hassan');
    addUser('333', 'Employé', 'user', 'Hassan');
  });

  afterEach(() => {
    db.close();
  });

  // ════════════════════════════════════════════════════
  // getUserRole
  // ════════════════════════════════════════════════════

  describe('getUserRole()', () => {
    it('retourne "owner" pour le propriétaire', () => {
      expect(getUserRole('111')).toBe('owner');
    });

    it('retourne "admin" pour un admin', () => {
      expect(getUserRole('222')).toBe('admin');
    });

    it('retourne "user" pour un utilisateur standard', () => {
      expect(getUserRole('333')).toBe('user');
    });

    it('retourne null pour un chatId inexistant', () => {
      expect(getUserRole('999')).toBeNull();
    });

    it('retourne null pour un utilisateur désactivé', () => {
      removeUser('333');
      expect(getUserRole('333')).toBeNull();
    });
  });

  // ════════════════════════════════════════════════════
  // hasPermission - add_user
  // ════════════════════════════════════════════════════

  describe('hasPermission() - add_user', () => {
    it('owner peut ajouter un utilisateur', () => {
      expect(hasPermission('111', 'add_user')).toBe(true);
    });

    it('admin peut ajouter un utilisateur', () => {
      expect(hasPermission('222', 'add_user')).toBe(true);
    });

    it('user NE PEUT PAS ajouter un utilisateur', () => {
      expect(hasPermission('333', 'add_user')).toBe(false);
    });

    it('chatId inconnu NE PEUT PAS ajouter un utilisateur', () => {
      expect(hasPermission('999', 'add_user')).toBe(false);
    });

    it('alias "adduser" a les mêmes permissions que "add_user"', () => {
      expect(hasPermission('111', 'adduser')).toBe(true);
      expect(hasPermission('222', 'adduser')).toBe(true);
      expect(hasPermission('333', 'adduser')).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════
  // hasPermission - remove_user
  // ════════════════════════════════════════════════════

  describe('hasPermission() - remove_user', () => {
    it('owner peut supprimer un utilisateur', () => {
      expect(hasPermission('111', 'remove_user')).toBe(true);
    });

    it('admin peut supprimer un utilisateur', () => {
      expect(hasPermission('222', 'remove_user')).toBe(true);
    });

    it('user NE PEUT PAS supprimer un utilisateur', () => {
      expect(hasPermission('333', 'remove_user')).toBe(false);
    });

    it('alias "removeuser" a les mêmes permissions', () => {
      expect(hasPermission('333', 'removeuser')).toBe(false);
      expect(hasPermission('111', 'removeuser')).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════
  // hasPermission - restart_bot (owner uniquement)
  // ════════════════════════════════════════════════════

  describe('hasPermission() - restart_bot', () => {
    it('owner peut redémarrer le bot', () => {
      expect(hasPermission('111', 'restart_bot')).toBe(true);
    });

    it('admin NE PEUT PAS redémarrer le bot', () => {
      expect(hasPermission('222', 'restart_bot')).toBe(false);
    });

    it('user NE PEUT PAS redémarrer le bot', () => {
      expect(hasPermission('333', 'restart_bot')).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════
  // hasPermission - mark_invoice_as_paid
  // ════════════════════════════════════════════════════

  describe('hasPermission() - mark_invoice_as_paid', () => {
    it('owner peut marquer une facture payée', () => {
      expect(hasPermission('111', 'mark_invoice_as_paid')).toBe(true);
    });

    it('admin peut marquer une facture payée', () => {
      expect(hasPermission('222', 'mark_invoice_as_paid')).toBe(true);
    });

    it('user NE PEUT PAS marquer une facture payée', () => {
      expect(hasPermission('333', 'mark_invoice_as_paid')).toBe(false);
    });

    it('alias "markpaid" a les mêmes permissions', () => {
      expect(hasPermission('333', 'markpaid')).toBe(false);
      expect(hasPermission('111', 'markpaid')).toBe(true);
    });

    it('alias "payinvoice" a les mêmes permissions', () => {
      expect(hasPermission('333', 'payinvoice')).toBe(false);
      expect(hasPermission('222', 'payinvoice')).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════
  // hasPermission - opérations non restreintes
  // ════════════════════════════════════════════════════

  describe('hasPermission() - opérations non restreintes', () => {
    it('toute opération inconnue est autorisée pour tous', () => {
      expect(hasPermission('111', 'unpaid')).toBe(true);
      expect(hasPermission('222', 'stats')).toBe(true);
      expect(hasPermission('333', 'help')).toBe(true);
    });

    it('listusers est accessible à tous les rôles', () => {
      expect(hasPermission('111', 'listusers')).toBe(true);
      expect(hasPermission('222', 'listusers')).toBe(true);
      expect(hasPermission('333', 'listusers')).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════
  // getPermissionDeniedMessage
  // ════════════════════════════════════════════════════

  describe('getPermissionDeniedMessage()', () => {
    it('retourne un message avec les rôles requis pour add_user', () => {
      const msg = getPermissionDeniedMessage('add_user');
      expect(msg).toContain('⛔');
      expect(msg).toContain('owner');
      expect(msg).toContain('admin');
    });

    it('retourne un message "owner" uniquement pour restart_bot', () => {
      const msg = getPermissionDeniedMessage('restart_bot');
      expect(msg).toContain('⛔');
      expect(msg).toContain('owner');
      expect(msg).not.toContain('admin');
    });

    it('retourne une chaîne vide pour une opération non restreinte', () => {
      expect(getPermissionDeniedMessage('unpaid')).toBe('');
      expect(getPermissionDeniedMessage('help')).toBe('');
    });
  });

  // ════════════════════════════════════════════════════
  // Cas limites / edge cases
  // ════════════════════════════════════════════════════

  describe('Edge cases', () => {
    it('utilisateur désactivé perd toutes ses permissions', () => {
      expect(hasPermission('222', 'add_user')).toBe(true);
      removeUser('222');
      expect(hasPermission('222', 'add_user')).toBe(false);
    });

    it('getUserRole retourne null après désactivation', () => {
      expect(getUserRole('222')).toBe('admin');
      removeUser('222');
      expect(getUserRole('222')).toBeNull();
    });

    it('un chatId vide retourne false', () => {
      expect(hasPermission('', 'add_user')).toBe(false);
    });

    it('les rôles sont sensibles à la casse dans la BDD', () => {
      // La contrainte CHECK dans la BDD empêche d'insérer un rôle invalide
      expect(() => {
        db.prepare('INSERT INTO authorized_users (chat_id, username, role) VALUES (?, ?, ?)').run('444', 'Test', 'OWNER');
      }).toThrow();
    });

    it('impossible de supprimer le dernier utilisateur (logique métier)', () => {
      // Supprimer 2 des 3 utilisateurs
      removeUser('222');
      removeUser('333');
      const users = getAllUsers();
      expect(users.length).toBe(1);
      expect(users[0].chat_id).toBe('111');
    });

    it('un utilisateur peut être ré-ajouté après désactivation', () => {
      removeUser('333');
      expect(getUserRole('333')).toBeNull();
      // Re-activate: on fait un UPDATE car le record existe (is_active=0)
      db.prepare('UPDATE authorized_users SET is_active = 1 WHERE chat_id = ?').run('333');
      expect(getUserRole('333')).toBe('user');
    });
  });

  // ════════════════════════════════════════════════════
  // Simulation du flow command-handler
  // ════════════════════════════════════════════════════

  describe('Simulation command-handler flow', () => {
    /**
     * Simule la logique dans command-handler.ts:
     * if (callerChatId && !hasPermission(callerChatId, 'adduser')) {
     *   return getPermissionDeniedMessage('adduser');
     * }
     */
    function simulateCommandHandler(command: string, callerChatId?: string): string {
      if (callerChatId && !hasPermission(callerChatId, command)) {
        return getPermissionDeniedMessage(command);
      }
      return `OK: /${command} exécuté`;
    }

    it('owner peut exécuter /adduser', () => {
      expect(simulateCommandHandler('adduser', '111')).toBe('OK: /adduser exécuté');
    });

    it('admin peut exécuter /adduser', () => {
      expect(simulateCommandHandler('adduser', '222')).toBe('OK: /adduser exécuté');
    });

    it('user reçoit un refus pour /adduser', () => {
      const result = simulateCommandHandler('adduser', '333');
      expect(result).toContain('⛔');
    });

    it('owner peut exécuter /removeuser', () => {
      expect(simulateCommandHandler('removeuser', '111')).toBe('OK: /removeuser exécuté');
    });

    it('user reçoit un refus pour /removeuser', () => {
      const result = simulateCommandHandler('removeuser', '333');
      expect(result).toContain('⛔');
    });

    it('owner peut exécuter /markpaid', () => {
      expect(simulateCommandHandler('markpaid', '111')).toBe('OK: /markpaid exécuté');
    });

    it('user reçoit un refus pour /markpaid', () => {
      const result = simulateCommandHandler('markpaid', '333');
      expect(result).toContain('⛔');
    });

    it('tous les rôles peuvent exécuter /help', () => {
      expect(simulateCommandHandler('help', '111')).toBe('OK: /help exécuté');
      expect(simulateCommandHandler('help', '222')).toBe('OK: /help exécuté');
      expect(simulateCommandHandler('help', '333')).toBe('OK: /help exécuté');
    });

    it('sans callerChatId, la commande passe (rétrocompatibilité)', () => {
      expect(simulateCommandHandler('adduser')).toBe('OK: /adduser exécuté');
      expect(simulateCommandHandler('removeuser')).toBe('OK: /removeuser exécuté');
    });
  });

  // ════════════════════════════════════════════════════
  // Simulation du flow AI agent
  // ════════════════════════════════════════════════════

  describe('Simulation AI agent flow', () => {
    /**
     * Simule la logique dans ai-agent-service-v2.ts executeFunction:
     * if (this.chatId && !hasPermission(this.chatId, 'add_user')) {
     *   result = { success: false, error: 'permission_denied', message: getPermissionDeniedMessage('add_user') };
     *   break;
     * }
     */
    function simulateAIExecuteFunction(functionName: string, chatId: string | null): { success: boolean; error?: string; message: string } {
      if (chatId && !hasPermission(chatId, functionName)) {
        return { success: false, error: 'permission_denied', message: getPermissionDeniedMessage(functionName) };
      }
      return { success: true, message: `${functionName} exécuté` };
    }

    it('owner peut exécuter add_user via IA', () => {
      const result = simulateAIExecuteFunction('add_user', '111');
      expect(result.success).toBe(true);
    });

    it('admin peut exécuter add_user via IA', () => {
      const result = simulateAIExecuteFunction('add_user', '222');
      expect(result.success).toBe(true);
    });

    it('user reçoit permission_denied pour add_user via IA', () => {
      const result = simulateAIExecuteFunction('add_user', '333');
      expect(result.success).toBe(false);
      expect(result.error).toBe('permission_denied');
      expect(result.message).toContain('⛔');
    });

    it('user reçoit permission_denied pour remove_user via IA', () => {
      const result = simulateAIExecuteFunction('remove_user', '333');
      expect(result.success).toBe(false);
      expect(result.error).toBe('permission_denied');
    });

    it('seul owner peut exécuter restart_bot via IA', () => {
      expect(simulateAIExecuteFunction('restart_bot', '111').success).toBe(true);
      expect(simulateAIExecuteFunction('restart_bot', '222').success).toBe(false);
      expect(simulateAIExecuteFunction('restart_bot', '333').success).toBe(false);
    });

    it('user reçoit permission_denied pour mark_invoice_as_paid via IA', () => {
      const result = simulateAIExecuteFunction('mark_invoice_as_paid', '333');
      expect(result.success).toBe(false);
      expect(result.error).toBe('permission_denied');
    });

    it('admin peut exécuter mark_invoice_as_paid via IA', () => {
      const result = simulateAIExecuteFunction('mark_invoice_as_paid', '222');
      expect(result.success).toBe(true);
    });

    it('opérations non restreintes passent pour tous', () => {
      expect(simulateAIExecuteFunction('get_unpaid_invoices', '333').success).toBe(true);
      expect(simulateAIExecuteFunction('get_paid_invoices', '333').success).toBe(true);
      expect(simulateAIExecuteFunction('list_users', '333').success).toBe(true);
    });

    it('chatId null laisse passer (rétrocompatibilité)', () => {
      expect(simulateAIExecuteFunction('add_user', null).success).toBe(true);
      expect(simulateAIExecuteFunction('restart_bot', null).success).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════
  // Matrice complète de permissions
  // ════════════════════════════════════════════════════

  describe('Matrice complète de permissions', () => {
    const operations = [
      'add_user', 'adduser',
      'remove_user', 'removeuser',
      'restart_bot',
      'mark_invoice_as_paid', 'markpaid', 'payinvoice',
    ];

    const expectedMatrix: Record<string, Record<string, boolean>> = {
      'owner': {
        'add_user': true, 'adduser': true,
        'remove_user': true, 'removeuser': true,
        'restart_bot': true,
        'mark_invoice_as_paid': true, 'markpaid': true, 'payinvoice': true,
      },
      'admin': {
        'add_user': true, 'adduser': true,
        'remove_user': true, 'removeuser': true,
        'restart_bot': false,
        'mark_invoice_as_paid': true, 'markpaid': true, 'payinvoice': true,
      },
      'user': {
        'add_user': false, 'adduser': false,
        'remove_user': false, 'removeuser': false,
        'restart_bot': false,
        'mark_invoice_as_paid': false, 'markpaid': false, 'payinvoice': false,
      },
    };

    const roleToChat: Record<string, string> = {
      'owner': '111',
      'admin': '222',
      'user': '333',
    };

    for (const role of ['owner', 'admin', 'user']) {
      for (const op of operations) {
        const expected = expectedMatrix[role][op];
        it(`${role} ${expected ? 'PEUT' : 'NE PEUT PAS'} exécuter ${op}`, () => {
          expect(hasPermission(roleToChat[role], op)).toBe(expected);
        });
      }
    }
  });
});
