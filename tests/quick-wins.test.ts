/**
 * Tests pour le bundle "quick wins" (D) :
 *  - #15 : callback_data <= 64 bytes — strictement vérifié
 *  - #16 : pay_invoice handler lit getPayContext (plus de decodeURIComponent fragile)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { InvoiceMonitoringService } from '../src/invoice-monitoring-service';
import type { BillitInvoice } from '../src/types';

afterEach(() => vi.restoreAllMocks());

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function makeInvoice(overrides: Partial<BillitInvoice> = {}): BillitInvoice {
  return {
    id: 'inv-id-123', invoice_number: 'F001', total_amount: 100,
    invoice_date: '2026-04-01', due_date: '2026-05-01',
    currency: 'EUR', supplier_name: 'Test SA', status: 'unpaid',
    created_at: '2026-04-01', updated_at: '2026-04-01',
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// #15 — callback_data overflow Telegram (64 bytes)
// ─────────────────────────────────────────────

describe('#15 — callback_data sous la limite Telegram (64 bytes)', () => {
  it('format actuel "pay_invoice:${id}" reste sous 64 bytes même avec UUID 36 chars', () => {
    const longId = '12345678-1234-1234-1234-123456789abc'; // 36 chars
    const callback = `pay_invoice:${longId}`;
    expect(Buffer.byteLength(callback, 'utf-8')).toBeLessThanOrEqual(64);
  });

  it('même avec un ID extrême (40 chars), reste sous limite', () => {
    const id = 'X'.repeat(40);
    const callback = `pay_invoice:${id}`;
    expect(Buffer.byteLength(callback, 'utf-8')).toBeLessThanOrEqual(64);
  });

  it('format "reconcile_link:${invoiceId}_${txId}" : audit pour les boutons réconciliation', () => {
    // Vérifie que les autres callbacks utilisés ne risquent pas le même bug
    const invoiceId = 'a'.repeat(20);
    const txId = 'b'.repeat(20);
    const callback = `reconcile_link:${invoiceId}_${txId}`;
    expect(Buffer.byteLength(callback, 'utf-8')).toBeLessThanOrEqual(64);
  });

  it('REGRESSION : ancien format avec supplier_name long DÉPASSAIT la limite', () => {
    // C'est le bug qu'on a fixé — on documente que l'ancien format ne tenait pas
    const id = '12345678-1234-1234-1234-123456789abc';
    const oldFormat = `pay_invoice:${id}:F2026/00123:Coca-Cola Europacific Partners Belgium SRL`;
    expect(Buffer.byteLength(oldFormat, 'utf-8')).toBeGreaterThan(64);
  });
});

// ─────────────────────────────────────────────
// #16 — payButtonContext (lookup serveur, plus de parse fragile)
// ─────────────────────────────────────────────

describe('#16 — InvoiceMonitoring.payButtonContext lookup', () => {
  function makeMonitoring() {
    const fakeBot = {} as any;
    const fakeBillit = {} as any;
    return new InvoiceMonitoringService(fakeBot, fakeBillit, {
      enabled: false, intervalMinutes: 60, checkPaid: false, checkUnpaid: false,
      storageFile: '/tmp/test.json',
    });
  }

  it('registerPayContext + getPayContext : round-trip OK', () => {
    const svc = makeMonitoring();
    const inv = makeInvoice({ id: 'inv-1', invoice_number: 'F001', supplier_name: 'Foster SA' });
    (svc as any).registerPayContext(inv);

    const ctx = svc.getPayContext('inv-1');
    expect(ctx).toEqual({ invoiceNumber: 'F001', supplierName: 'Foster SA' });
  });

  it('un nom de fournisseur avec caractères spéciaux est préservé tel quel (plus de decodeURIComponent fragile)', () => {
    const svc = makeMonitoring();
    // L'ancien parsing cassait sur "%" → URIError. Maintenant, c'est juste une lookup Map.
    const inv = makeInvoice({
      id: 'inv-2',
      invoice_number: 'F002',
      supplier_name: 'Pluxee 50% off + Société: SARL',
    });
    (svc as any).registerPayContext(inv);

    const ctx = svc.getPayContext('inv-2');
    expect(ctx?.supplierName).toBe('Pluxee 50% off + Société: SARL');
  });

  it('getPayContext sur un ID inconnu retourne undefined (pas d\'exception)', () => {
    const svc = makeMonitoring();
    expect(svc.getPayContext('never-registered')).toBeUndefined();
  });

  it('contexte expiré (>24h) retourne undefined', () => {
    const svc = makeMonitoring();
    const inv = makeInvoice({ id: 'old-id' });
    (svc as any).registerPayContext(inv);
    // Forcer un createdAt vieux de 25h
    const entry = (svc as any).payButtonContext.get('old-id');
    entry.createdAt = Date.now() - 25 * 60 * 60 * 1000;

    expect(svc.getPayContext('old-id')).toBeUndefined();
    // Au passage, l'entry stale est purgée
    expect((svc as any).payButtonContext.has('old-id')).toBe(false);
  });

  it('cap à PAY_CONTEXT_MAX_SIZE empêche la croissance non bornée', () => {
    const svc = makeMonitoring();
    const MAX = (svc as any).PAY_CONTEXT_MAX_SIZE;

    // Insert MAX + 10 entries
    for (let i = 0; i < MAX + 10; i++) {
      (svc as any).registerPayContext(makeInvoice({ id: `inv-${i}` }));
    }

    expect((svc as any).payButtonContext.size).toBeLessThanOrEqual(MAX);
    // Les premières entries ont été évincées (FIFO)
    expect(svc.getPayContext('inv-0')).toBeUndefined();
    // Les dernières existent toujours
    expect(svc.getPayContext(`inv-${MAX + 9}`)).toBeDefined();
  });
});
