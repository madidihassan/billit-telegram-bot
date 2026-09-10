/**
 * Tests pour le bundle "security" (E) :
 *  - #4  : Auto-désactivation des users qui ont bloqué le bot
 *  - #7  : restart_bot non exposé au LLM pour un user "user"
 *  - #14 : Filtrage des outils par rôle avant envoi au LLM (defense in depth)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// On force le storage SQLite vers un fichier temporaire AVANT d'importer database.ts
// pour ne pas polluer la vraie DB du bot. database.ts lit BILLIT_DB_PATH au load.
const tmpDbPath = path.join(os.tmpdir(), `security-test-${Date.now()}-${Math.random()}.db`);
process.env.BILLIT_DB_PATH = tmpDbPath;

import {
  initializeDatabase,
  addAuthorizedUser,
  removeAuthorizedUser,
  isUserAuthorized,
  getUserRole,
  isToolAllowedForRole,
  filterToolsByChatRole,
  hasPermission,
} from '../src/database';

// Init du schéma sur la DB temporaire
initializeDatabase();

beforeEach(() => {
  // Cleanup users de tests précédents (la DB persiste entre tests dans le même process)
  removeAuthorizedUser('test_owner');
  removeAuthorizedUser('test_admin');
  removeAuthorizedUser('test_user');
});

// Cleanup final
import { afterAll } from 'vitest';
afterAll(() => {
  try { fs.unlinkSync(tmpDbPath); } catch { /* */ }
});

// ─────────────────────────────────────────────
// #4 — Auto-désactivation : helper isPermanentTelegramFailure
// ─────────────────────────────────────────────
//
// Note : la fonction `isPermanentTelegramFailure` est interne à telegram-bot.ts (pas exportée).
// On la teste indirectement via reproduction du shape d'erreurs Telegram réels.
// L'idée est de documenter les cas couverts pour le mainteneur.

describe('#4 — Détection erreurs Telegram permanentes', () => {
  // On reproduit le helper localement pour tester la logique sans charger telegram-bot.ts (qui
  // initialise tout le bot). C'est un mirror exact de la fonction privée.
  function isPermanentTelegramFailure(error: any): boolean {
    const code = error?.response?.body?.error_code ?? error?.code;
    const description = (error?.response?.body?.description ?? error?.message ?? '').toLowerCase();
    if (code === 403) {
      return description.includes('blocked') || description.includes('deactivated') || description.includes('kicked');
    }
    if (code === 400) {
      return description.includes('chat not found');
    }
    return false;
  }

  it('détecte 403 "bot was blocked by the user"', () => {
    const err = {
      response: { body: { error_code: 403, description: 'Forbidden: bot was blocked by the user' } }
    };
    expect(isPermanentTelegramFailure(err)).toBe(true);
  });

  it('détecte 403 "user is deactivated"', () => {
    const err = {
      response: { body: { error_code: 403, description: 'Forbidden: user is deactivated' } }
    };
    expect(isPermanentTelegramFailure(err)).toBe(true);
  });

  it('détecte 403 "bot was kicked from the supergroup"', () => {
    const err = {
      response: { body: { error_code: 403, description: 'Forbidden: bot was kicked from the supergroup chat' } }
    };
    expect(isPermanentTelegramFailure(err)).toBe(true);
  });

  it('détecte 400 "chat not found"', () => {
    const err = {
      response: { body: { error_code: 400, description: 'Bad Request: chat not found' } }
    };
    expect(isPermanentTelegramFailure(err)).toBe(true);
  });

  it('NE désactive PAS sur erreur réseau transitoire', () => {
    const err = { code: 'ETELEGRAM', message: 'EFATAL: AggregateError' };
    expect(isPermanentTelegramFailure(err)).toBe(false);
  });

  it('NE désactive PAS sur 429 rate limit', () => {
    const err = {
      response: { body: { error_code: 429, description: 'Too Many Requests: retry after 30' } }
    };
    expect(isPermanentTelegramFailure(err)).toBe(false);
  });

  it('NE désactive PAS sur 400 "message is too long"', () => {
    const err = {
      response: { body: { error_code: 400, description: 'Bad Request: message is too long' } }
    };
    expect(isPermanentTelegramFailure(err)).toBe(false);
  });

  it('NE désactive PAS si l\'erreur n\'a pas de structure Telegram', () => {
    expect(isPermanentTelegramFailure(new Error('boom'))).toBe(false);
    expect(isPermanentTelegramFailure(null)).toBe(false);
    expect(isPermanentTelegramFailure({})).toBe(false);
  });
});

// ─────────────────────────────────────────────
// #4 — removeAuthorizedUser : intégration DB
// ─────────────────────────────────────────────

describe('#4 — removeAuthorizedUser auto-désactive en DB', () => {
  it('marque is_active=0 → l\'user n\'est plus retourné par isUserAuthorized', () => {
    addAuthorizedUser('test_user', 'tester', 'user', 'system');
    expect(isUserAuthorized('test_user')).toBe(true);

    const ok = removeAuthorizedUser('test_user');
    expect(ok).toBe(true);
    expect(isUserAuthorized('test_user')).toBe(false);
  });

  it('removeAuthorizedUser sur ID inconnu retourne false sans crash', () => {
    expect(removeAuthorizedUser('never_existed_xyz')).toBe(false);
  });
});

// ─────────────────────────────────────────────
// #7 + #14 — Filtrage des outils par rôle
// ─────────────────────────────────────────────

describe('#7+#14 — Tool filtering par rôle', () => {
  describe('isToolAllowedForRole', () => {
    it('restart_bot : owner ✅, admin ❌, user ❌', () => {
      expect(isToolAllowedForRole('restart_bot', 'owner')).toBe(true);
      expect(isToolAllowedForRole('restart_bot', 'admin')).toBe(false);
      expect(isToolAllowedForRole('restart_bot', 'user')).toBe(false);
    });

    it('add_user : owner ✅, admin ✅, user ❌', () => {
      expect(isToolAllowedForRole('add_user', 'owner')).toBe(true);
      expect(isToolAllowedForRole('add_user', 'admin')).toBe(true);
      expect(isToolAllowedForRole('add_user', 'user')).toBe(false);
    });

    it('remove_user : owner ✅, admin ✅, user ❌', () => {
      expect(isToolAllowedForRole('remove_user', 'owner')).toBe(true);
      expect(isToolAllowedForRole('remove_user', 'admin')).toBe(true);
      expect(isToolAllowedForRole('remove_user', 'user')).toBe(false);
    });

    it('mark_invoice_as_paid : owner ✅, admin ✅, user ❌', () => {
      expect(isToolAllowedForRole('mark_invoice_as_paid', 'owner')).toBe(true);
      expect(isToolAllowedForRole('mark_invoice_as_paid', 'admin')).toBe(true);
      expect(isToolAllowedForRole('mark_invoice_as_paid', 'user')).toBe(false);
    });

    it('outil non restreint (get_invoices) : visible par tous', () => {
      expect(isToolAllowedForRole('get_invoices', 'user')).toBe(true);
      expect(isToolAllowedForRole('get_invoices', 'admin')).toBe(true);
      expect(isToolAllowedForRole('get_invoices', 'owner')).toBe(true);
    });
  });

  describe('filterToolsByChatRole', () => {
    const allTools = [
      { type: 'function', function: { name: 'restart_bot', description: '', parameters: {} } },
      { type: 'function', function: { name: 'add_user', description: '', parameters: {} } },
      { type: 'function', function: { name: 'remove_user', description: '', parameters: {} } },
      { type: 'function', function: { name: 'mark_invoice_as_paid', description: '', parameters: {} } },
      { type: 'function', function: { name: 'get_invoices', description: '', parameters: {} } },
      { type: 'function', function: { name: 'list_users', description: '', parameters: {} } },
    ];

    it('user "user" ne voit que les outils non restreints (pas restart_bot/add_user/etc)', () => {
      addAuthorizedUser('test_user', 'tester', 'user', 'system');
      const filtered = filterToolsByChatRole(allTools, 'test_user');
      const names = filtered.map(t => t.function.name);

      expect(names).not.toContain('restart_bot');
      expect(names).not.toContain('add_user');
      expect(names).not.toContain('remove_user');
      expect(names).not.toContain('mark_invoice_as_paid');
      expect(names).toContain('get_invoices');
      expect(names).toContain('list_users');
    });

    it('admin voit add_user/remove_user/mark_invoice_as_paid mais PAS restart_bot', () => {
      addAuthorizedUser('test_admin', 'admin', 'admin', 'system');
      const filtered = filterToolsByChatRole(allTools, 'test_admin');
      const names = filtered.map(t => t.function.name);

      expect(names).toContain('add_user');
      expect(names).toContain('remove_user');
      expect(names).toContain('mark_invoice_as_paid');
      expect(names).not.toContain('restart_bot');
      expect(names).toContain('get_invoices');
    });

    it('owner voit absolument tous les outils', () => {
      addAuthorizedUser('test_owner', 'owner', 'owner', 'system');
      const filtered = filterToolsByChatRole(allTools, 'test_owner');
      expect(filtered).toHaveLength(allTools.length);
    });

    it('chatId inconnu → niveau "user" par défaut (least privilege)', () => {
      const filtered = filterToolsByChatRole(allTools, 'totally_unknown_chat_id_xyz');
      const names = filtered.map(t => t.function.name);
      expect(names).not.toContain('restart_bot');
      expect(names).not.toContain('add_user');
      expect(names).toContain('get_invoices');
    });

    it('chatId undefined → niveau "user" par défaut', () => {
      const filtered = filterToolsByChatRole(allTools, undefined);
      const names = filtered.map(t => t.function.name);
      expect(names).not.toContain('restart_bot');
    });

    it('outil avec function.name undefined : conservé (pas de filtrage applicable)', () => {
      const weirdTools = [
        { type: 'function' }, // pas de function du tout
        { type: 'function', function: { description: 'sans nom' } as any }, // function sans name
        { type: 'function', function: { name: 'restart_bot', description: '', parameters: {} } },
      ];
      addAuthorizedUser('test_user', 'tester', 'user', 'system');
      const filtered = filterToolsByChatRole(weirdTools as any, 'test_user');
      // 2 weird tools conservés, restart_bot filtré
      expect(filtered).toHaveLength(2);
    });
  });
});

// ─────────────────────────────────────────────
// Defense in depth : filterToolsByChatRole + hasPermission
// ─────────────────────────────────────────────

describe('Defense in depth — filtrage upstream + check runtime', () => {
  it('même si le LLM "voit" un outil restreint (cas anormal), hasPermission le bloque', () => {
    addAuthorizedUser('test_user', 'tester', 'user', 'system');
    // Simule le cas où, malgré le filtrage, le LLM tente d'appeler restart_bot
    expect(hasPermission('test_user', 'restart_bot')).toBe(false);
    expect(hasPermission('test_user', 'add_user')).toBe(false);
  });

  it('owner peut tout', () => {
    addAuthorizedUser('test_owner', 'owner', 'owner', 'system');
    expect(hasPermission('test_owner', 'restart_bot')).toBe(true);
    expect(hasPermission('test_owner', 'add_user')).toBe(true);
    expect(hasPermission('test_owner', 'mark_invoice_as_paid')).toBe(true);
  });

  it('user inconnu n\'a aucune permission restreinte', () => {
    expect(hasPermission('truly_unknown_xyz', 'restart_bot')).toBe(false);
    expect(hasPermission('truly_unknown_xyz', 'add_user')).toBe(false);
  });
});

// Référence muette à getUserRole pour silencer l'analyse "unused import"
void getUserRole;
