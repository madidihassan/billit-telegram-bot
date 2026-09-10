/**
 * Vérifie le chemin complet de notification après le passage au notifier léger
 * (index-notify.ts) : InvoiceMonitoringService doit diffuser via l'interface
 * InvoiceNotifier, avec le bouton « Marquer Payé » correctement formé.
 */

import { describe, it, expect, vi } from 'vitest';
import { InvoiceMonitoringService } from '../src/invoice-monitoring-service';
import type { InvoiceNotifier } from '../src/types/notifier';
import type { BillitInvoice } from '../src/types';

function makeNotifier() {
  return {
    broadcastMessage: vi.fn().mockResolvedValue(true),
    broadcastDocument: vi.fn().mockResolvedValue(undefined),
  } satisfies InvoiceNotifier;
}

function makeService(notifier: InvoiceNotifier, pdf: Buffer | null, payError?: Error) {
  const billitClient = {
    downloadInvoicePdf: vi.fn().mockResolvedValue(pdf),
    addPaymentToOrder: payError
      ? vi.fn().mockRejectedValue(payError)
      : vi.fn().mockResolvedValue(undefined),
  } as any;
  return new InvoiceMonitoringService(notifier, billitClient, {
    enabled: false,
    intervalMinutes: 15,
    checkPaid: true,
    checkUnpaid: true,
    storageFile: './data/test-processed.json',
  });
}

function makeInvoice(overrides: Partial<BillitInvoice> = {}): BillitInvoice {
  return {
    id: 'inv-42', invoice_number: 'F2026-042', total_amount: 1234.56,
    invoice_date: '2026-09-01', due_date: '2026-09-30',
    currency: 'EUR', supplier_name: 'Coca-Cola Europacific Partners Belgium SRL',
    status: 'pending', created_at: '2026-09-01', updated_at: '2026-09-01',
    ...overrides,
  };
}

describe('chemin de notification (notifier léger)', () => {
  it('envoie le PDF avec le bouton « Marquer Payé » quand le PDF est disponible', async () => {
    const notifier = makeNotifier();
    const service = makeService(notifier, Buffer.from('%PDF-1.4 fake'));

    await (service as any).notifyNewInvoice(makeInvoice());

    expect(notifier.broadcastDocument).toHaveBeenCalledTimes(1);
    const [buffer, filename, caption, markup] = notifier.broadcastDocument.mock.calls[0];
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(filename).toContain('F2026-042');
    expect(caption).toContain('F2026-042');

    const button = markup.inline_keyboard[0][0];
    expect(button.callback_data).toBe('pay_invoice:inv-42');
    // La limite Telegram est de 64 bytes : au-delà, le bouton n'est pas envoyé.
    expect(Buffer.byteLength(button.callback_data, 'utf8')).toBeLessThanOrEqual(64);
  });

  it('retombe sur un message texte quand le PDF est indisponible', async () => {
    const notifier = makeNotifier();
    const service = makeService(notifier, null);

    await (service as any).notifyNewInvoice(makeInvoice());

    expect(notifier.broadcastDocument).not.toHaveBeenCalled();
    expect(notifier.broadcastMessage).toHaveBeenCalledTimes(1);
    expect(notifier.broadcastMessage.mock.calls[0][0]).toContain('F2026-042');
  });

  it('expose le contexte du bouton au handler « Payé » du notifier', async () => {
    const notifier = makeNotifier();
    const service = makeService(notifier, Buffer.from('pdf'));

    await (service as any).notifyNewInvoice(makeInvoice());

    const context = service.getPayContext('inv-42');
    expect(context).toEqual({
      invoiceNumber: 'F2026-042',
      supplierName: 'Coca-Cola Europacific Partners Belgium SRL',
    });
  });

  it('garde le bouton pour un statut contenant « paid » sans être payé', async () => {
    const notifier = makeNotifier();
    const service = makeService(notifier, Buffer.from('pdf'));

    await (service as any).notifyNewInvoice(makeInvoice({ status: 'partiallyPaid' }));

    const markup = notifier.broadcastDocument.mock.calls[0][3];
    expect(markup.inline_keyboard[0][0].callback_data).toBe('pay_invoice:inv-42');
  });

  it('ne met pas de bouton sur une facture déjà payée', async () => {
    const notifier = makeNotifier();
    const service = makeService(notifier, Buffer.from('pdf'));

    await (service as any).notifyNewInvoice(makeInvoice({ status: 'paid' }));

    expect(notifier.broadcastDocument.mock.calls[0][3]).toBeUndefined();
  });

  it('notifie les factures en retard via broadcastMessage', async () => {
    const notifier = makeNotifier();
    const service = makeService(notifier, null);

    await (service as any).notifyOverdueInvoice(
      makeInvoice({ due_date: '2026-08-01' }), false
    );

    expect(notifier.broadcastMessage).toHaveBeenCalledTimes(1);
    expect(notifier.broadcastMessage.mock.calls[0][0]).toContain('F2026-042');
  });

  it('propage l\'échec Billit au lieu de le masquer', async () => {
    // Régression : markInvoicePaid avalait l'erreur, si bien que le handler du
    // bouton confirmait « facture marquée comme payée » après un refus de Billit.
    const service = makeService(makeNotifier(), null, new Error('403 Forbidden'));

    await expect(service.markInvoicePaid('inv-42')).rejects.toThrow('403 Forbidden');
  });

  it('résout sans erreur quand Billit accepte le marquage', async () => {
    const service = makeService(makeNotifier(), null);

    await expect(service.markInvoicePaid('inv-42')).resolves.toBeUndefined();
  });
});
