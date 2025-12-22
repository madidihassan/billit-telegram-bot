import axios, { AxiosInstance } from 'axios';
import { config } from './config';
import { BillitInvoice, BillitInvoicesResponse } from './types';
import { matchesSupplier, getSupplierPatterns } from './supplier-aliases';

export class BillitClient {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: config.billit.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'apikey': config.billit.apiKey,
      },
    });

    // Ajouter le PartyID (OBLIGATOIRE pour l'API Billit)
    if (config.billit.partyId) {
      this.axiosInstance.defaults.headers.common['partyID'] = config.billit.partyId;
    } else {
      console.warn('⚠️  BILLIT_PARTY_ID n\'est pas configuré - l\'API risque de retourner une erreur 401');
    }
  }

  /**
   * Récupère les factures depuis l'API Billit
   */
  async getInvoices(params?: {
    limit?: number;
    page?: number;
    from_date?: string;
  }): Promise<BillitInvoice[]> {
    try {
      console.log('🔍 Récupération des factures d\'achat depuis Billit...');

      // Construire le filtre OData pour les factures d'achat
      let filter = "OrderType eq 'Invoice' and OrderDirection eq 'Cost'";

      if (params?.from_date) {
        filter += ` and LastModified ge DateTime'${params.from_date}'`;
      }

      const response = await this.axiosInstance.get<any>('/v1/orders', {
        params: {
          $filter: filter,
          $top: params?.limit || 100,
        },
      });

      const invoices = response.data.Items || response.data.items || response.data || [];
      console.log(`✓ ${Array.isArray(invoices) ? invoices.length : 0} facture(s) d'achat récupérée(s)`);

      // Convertir le format Billit vers notre format
      return Array.isArray(invoices) ? this.convertBillitOrders(invoices) : [];
    } catch (error: any) {
      console.error('❌ Erreur lors de la récupération des factures:');

      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Message: ${JSON.stringify(error.response.data, null, 2)}`);
      } else if (error.request) {
        console.error('   Pas de réponse du serveur');
      } else {
        console.error(`   ${error.message}`);
      }

      throw error;
    }
  }

  /**
   * Récupère les factures créées depuis une date donnée
   */
  async getRecentInvoices(sinceDate: Date): Promise<BillitInvoice[]> {
    const fromDate = sinceDate.toISOString().split('T')[0];
    return this.getInvoices({ from_date: fromDate });
  }

  /**
   * Test de connexion à l'API
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getInvoices({ limit: 1 });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Convertit les orders Billit vers notre format
   */
  private convertBillitOrders(orders: any[]): BillitInvoice[] {
    return orders.map(order => ({
      id: String(order.OrderID || ''),
      invoice_number: order.OrderNumber || '',
      invoice_date: order.OrderDate || new Date().toISOString(),
      due_date: order.ExpiryDate || order.OrderDate || new Date().toISOString(),
      total_amount: order.TotalIncl || order.TotalInclVAT || 0,
      currency: order.Currency || 'EUR',
      supplier_name: order.CounterParty?.DisplayName || 'Inconnu',
      status: order.Paid === true ? 'paid' : (order.OrderStatus || 'pending'),
      created_at: order.Created || new Date().toISOString(),
      updated_at: order.LastModified || new Date().toISOString(),
      communication: order.PaymentReference || order.Reference || order.Description || '',
    }));
  }

  /**
   * Recherche des factures par nom de fournisseur (recherche intelligente avec aliases)
   */
  async searchBySupplier(supplierName: string, limit: number = 10): Promise<BillitInvoice[]> {
    const invoices = await this.getInvoices({ limit: 100 });
    
    // Utiliser le système d'aliases pour une meilleure correspondance
    const results = invoices.filter(inv => 
      matchesSupplier(inv.supplier_name, supplierName)
    );

    // Trier par date (plus récent en premier)
    results.sort((a, b) => 
      new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime()
    );

    return results.slice(0, limit);
  }

  /**
   * Récupère la dernière facture d'un fournisseur
   */
  async getLastInvoiceBySupplier(supplierName: string): Promise<BillitInvoice | null> {
    const invoices = await this.searchBySupplier(supplierName, 1);
    return invoices.length > 0 ? invoices[0] : null;
  }

  /**
   * Récupère toutes les factures impayées
   */
  async getUnpaidInvoices(): Promise<BillitInvoice[]> {
    const invoices = await this.getInvoices({ limit: 100 });
    return invoices.filter(inv => inv.status.toLowerCase() !== 'paid' && inv.status.toLowerCase() !== 'payé');
  }

  /**
   * Récupère les factures en retard
   */
  async getOverdueInvoices(): Promise<BillitInvoice[]> {
    const invoices = await this.getInvoices({ limit: 100 });
    const now = new Date();

    return invoices.filter(inv => {
      const isPaid = inv.status.toLowerCase() === 'paid' || inv.status.toLowerCase() === 'payé';
      if (isPaid) return false;

      const dueDate = new Date(inv.due_date);
      return dueDate < now;
    });
  }

  /**
   * Récupère les statistiques du mois en cours
   */
  async getMonthlyStats(): Promise<{
    total: number;
    paid: number;
    unpaid: number;
    count: number;
    paidCount: number;
    unpaidCount: number;
  }> {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const invoices = await this.getRecentInvoices(firstDay);

    let total = 0;
    let paid = 0;
    let unpaid = 0;
    let paidCount = 0;
    let unpaidCount = 0;

    invoices.forEach(inv => {
      total += inv.total_amount;
      const isPaid = inv.status.toLowerCase() === 'paid' || inv.status.toLowerCase() === 'payé';

      if (isPaid) {
        paid += inv.total_amount;
        paidCount++;
      } else {
        unpaid += inv.total_amount;
        unpaidCount++;
      }
    });

    return {
      total,
      paid,
      unpaid,
      count: invoices.length,
      paidCount,
      unpaidCount,
    };
  }

  /**
   * Normalise un texte pour la recherche (enlève espaces, tirets, etc.)
   */
  private normalizeSearchTerm(text: string): string {
    return text
      .toLowerCase()
      .replace(/[\s\-_\.\/\\]/g, '') // Enlever espaces, tirets, underscores, points, slashes
      .trim();
  }

  /**
   * Recherche des factures par terme général (recherche intelligente)
   */
  async searchInvoices(searchTerm: string, limit: number = 10): Promise<BillitInvoice[]> {
    const invoices = await this.getInvoices({ limit: 100 });
    const normalizedTerm = this.normalizeSearchTerm(searchTerm);

    // Recherche avec normalisation
    const results = invoices.filter(inv => {
      const normalizedInvoiceNumber = this.normalizeSearchTerm(inv.invoice_number);
      const normalizedSupplierName = this.normalizeSearchTerm(inv.supplier_name);
      const normalizedStatus = this.normalizeSearchTerm(inv.status);

      // Recherche exacte normalisée
      if (normalizedInvoiceNumber.includes(normalizedTerm)) return true;
      if (normalizedSupplierName.includes(normalizedTerm)) return true;
      if (normalizedStatus.includes(normalizedTerm)) return true;

      // Recherche partielle (pour les numéros)
      // Ex: "2500003745" doit matcher "SI-2500003745" ou "SI 2500003745"
      const termDigits = normalizedTerm.replace(/\D/g, ''); // Garder que les chiffres
      if (termDigits.length >= 4) {
        const invoiceDigits = normalizedInvoiceNumber.replace(/\D/g, '');
        if (invoiceDigits.includes(termDigits)) return true;
      }

      return false;
    });

    // Trier par pertinence : correspondance exacte en premier
    results.sort((a, b) => {
      const aNumber = this.normalizeSearchTerm(a.invoice_number);
      const bNumber = this.normalizeSearchTerm(b.invoice_number);
      
      // Si correspondance exacte, mettre en premier
      if (aNumber === normalizedTerm) return -1;
      if (bNumber === normalizedTerm) return 1;
      
      // Sinon, par date (plus récent en premier)
      return new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime();
    });

    return results.slice(0, limit);
  }

  /**
   * Recherche une facture par numéro (recherche intelligente)
   */
  async findInvoiceByNumber(invoiceNumber: string): Promise<BillitInvoice | null> {
    const results = await this.searchInvoices(invoiceNumber, 1);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Récupère les détails complets d'une facture (avec lignes)
   */
  async getInvoiceDetails(invoiceId: string): Promise<any> {
    try {
      console.log(`🔍 Récupération des détails de la facture ${invoiceId}...`);

      const response = await this.axiosInstance.get(`/v1/orders/${invoiceId}`);
      const order = response.data;

      console.log('✓ Détails récupérés');
      return order;
    } catch (error: any) {
      console.error('❌ Erreur lors de la récupération des détails:', error.message);
      throw error;
    }
  }

  /**
   * Récupère l'URL du PDF d'une facture
   */
  async getInvoicePdfUrl(invoiceId: string): Promise<string | null> {
    try {
      console.log(`📄 Récupération du PDF de la facture ${invoiceId}...`);

      // L'API Billit peut avoir un endpoint pour le PDF
      // Format probable: /v1/orders/{id}/pdf ou similaire
      const pdfUrl = `https://my.billit.eu/api/v1/orders/${invoiceId}/pdf`;
      
      return pdfUrl;
    } catch (error: any) {
      console.error('❌ Erreur lors de la récupération du PDF:', error.message);
      return null;
    }
  }
}
