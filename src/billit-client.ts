import axios, { AxiosInstance } from 'axios';
import { config } from './config';
import { BillitInvoice, BillitInvoicesResponse } from './types';
import { matchesSupplier, getSupplierPatterns } from './supplier-aliases';
import { normalizeSearchTerm } from './utils/string-utils';
import { BillitOrderDetails, BillitOrdersResponse, BillitODataParams } from './types/billit-api';

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
    skip?: number;
    from_date?: string;
    to_date?: string;
    order_date_from?: string;
    order_date_to?: string;
  }): Promise<BillitInvoice[]> {
    try {
      console.log('🔍 Récupération des factures d\'achat depuis Billit...');

      // Construire le filtre OData pour les factures d'achat
      let filter = "OrderType eq 'Invoice' and OrderDirection eq 'Cost'";

      // Filtre par LastModified (pour les factures récentes)
      if (params?.from_date) {
        filter += ` and LastModified ge DateTime'${params.from_date}'`;
      }
      if (params?.to_date) {
        filter += ` and LastModified le DateTime'${params.to_date}'`;
      }

      // Filtre par OrderDate (date réelle de la facture) - PRIORITAIRE pour périodes spécifiques
      if (params?.order_date_from) {
        filter += ` and OrderDate ge DateTime'${params.order_date_from}'`;
      }
      if (params?.order_date_to) {
        filter += ` and OrderDate le DateTime'${params.order_date_to}'`;
      }

      // IMPORTANT: Trier par OrderDate décroissant pour avoir les plus récentes en premier
      // et augmenter la limite à 120 (max autorisé par l'API Billit)
      const requestParams: any = {
        $filter: filter,
        $top: params?.limit || 120,
        $orderby: 'OrderDate desc',
      };

      // Ajouter $skip si fourni (pour pagination)
      if (params?.skip !== undefined && params.skip > 0) {
        requestParams.$skip = params.skip;
      }

      const response = await this.axiosInstance.get<BillitOrdersResponse>('/v1/orders', {
        params: requestParams,
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
  private convertBillitOrders(orders: BillitOrderDetails[]): BillitInvoice[] {
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
   * Récupère toutes les factures impayées avec pagination
   */
  async getUnpaidInvoices(): Promise<BillitInvoice[]> {
    const allInvoices: BillitInvoice[] = [];
    let skip = 0;
    const pageSize = 120; // Limite API Billit
    let hasMore = true;

    console.log('🔄 Récupération de TOUTES les factures impayées (pagination)...');

    while (hasMore) {
      // Récupérer une page de factures
      const invoices = await this.getInvoices({ 
        limit: pageSize,
        skip: skip 
      });

      if (invoices.length === 0) {
        hasMore = false;
        break;
      }

      // Filtrer les factures impayées
      const unpaid = invoices.filter(inv => 
        inv.status.toLowerCase() !== 'paid' && 
        inv.status.toLowerCase() !== 'payé'
      );

      allInvoices.push(...unpaid);

      // Si moins de 120 factures retournées, on a atteint la fin
      if (invoices.length < pageSize) {
        hasMore = false;
      } else {
        skip += pageSize;
      }
    }

    console.log(`✅ ${allInvoices.length} facture(s) impayée(s) trouvée(s) sur toutes les pages`);
    return allInvoices;
  }

  /**
   * Récupère toutes les factures payées
   */
  async getPaidInvoices(): Promise<BillitInvoice[]> {
    const invoices = await this.getInvoices({ limit: 100 });
    return invoices.filter(inv => inv.status.toLowerCase() === 'paid' || inv.status.toLowerCase() === 'payé');
  }

  /**
   * Récupère tous les documents (factures + brouillons) pour le monitoring
   * Inclut les documents en cours de saisie (saisi rapide)
   */
  async getAllDocuments(params?: {
    limit?: number;
    from_date?: string;
  }): Promise<BillitInvoice[]> {
    try {
      console.log('🔍 Récupération de tous les documents (factures + brouillons)...');

      // Construire le filtre OData pour inclure les factures ET les brouillons
      // OrderType peut être 'Invoice' ou 'Draft' (brouillon/saisi rapide)
      let filter = "(OrderType eq 'Invoice' or OrderType eq 'Draft') and OrderDirection eq 'Cost'";

      if (params?.from_date) {
        filter += ` and LastModified ge DateTime'${params.from_date}'`;
      }

      const response = await this.axiosInstance.get<BillitOrdersResponse>('/v1/orders', {
        params: {
          $filter: filter,
          $top: params?.limit || 100,
        },
      });

      const documents = response.data.Items || response.data.items || response.data || [];
      console.log(`✓ ${Array.isArray(documents) ? documents.length : 0} document(s) récupéré(s)`);

      return Array.isArray(documents) ? this.convertBillitOrders(documents) : [];
    } catch (error: any) {
      console.error('❌ Erreur lors de la récupération des documents:');
      throw error;
    }
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

  // Note: normalizeSearchTerm est maintenant importé depuis utils/string-utils
  // pour éviter la duplication de code

  /**
   * Recherche des factures par terme général (recherche intelligente)
   */
  async searchInvoices(searchTerm: string, limit: number = 10): Promise<BillitInvoice[]> {
    const invoices = await this.getInvoices({ limit: 100 });
    const normalizedTerm = normalizeSearchTerm(searchTerm);

    // Recherche avec normalisation
    const results = invoices.filter(inv => {
      const normalizedInvoiceNumber = normalizeSearchTerm(inv.invoice_number);
      const normalizedSupplierName = normalizeSearchTerm(inv.supplier_name);
      const normalizedStatus = normalizeSearchTerm(inv.status);

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
      const aNumber = normalizeSearchTerm(a.invoice_number);
      const bNumber = normalizeSearchTerm(b.invoice_number);

      // Si correspondance exacte, mettre en premier
      if (aNumber === normalizedTerm) return -1;
      if (bNumber === normalizedTerm) return 1;

      // Sinon, par date (plus récent en premier)
      return new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime();
    });

    return results.slice(0, limit);
  }

  /**
   * Recherche une facture par numéro de communication
   * @param communicationNumber Numéro de communication (partiel ou complet)
   * @returns Factures correspondantes
   */
  async searchByCommunication(communicationNumber: string, limit: number = 10): Promise<BillitInvoice[]> {
    try {
      console.log(`🔍 Recherche par communication: ${communicationNumber}`);

      const invoices = await this.getInvoices({ limit: 100 });

      // Normaliser le terme de recherche (enlever espaces, slash, etc.)
      const normalizedTerm = communicationNumber.replace(/[\s\/\-]/g, '').toLowerCase();

      const results = invoices.filter(inv => {
        if (!inv.communication) return false;

        // Normaliser la communication de la facture
        const normalizedCommunication = inv.communication.replace(/[\s\/\-+\+]/g, '').toLowerCase();

        // Recherche exacte
        if (normalizedCommunication === normalizedTerm) return true;

        // Recherche partielle (si terme >= 4 caractères)
        if (normalizedTerm.length >= 4) {
          if (normalizedCommunication.includes(normalizedTerm)) return true;
        }

        // Recherche par digits seulement (pour les communications structurées)
        const termDigits = normalizedTerm.replace(/\D/g, '');
        if (termDigits.length >= 4) {
          const commDigits = normalizedCommunication.replace(/\D/g, '');
          if (commDigits.includes(termDigits)) return true;
        }

        return false;
      });

      console.log(`✅ ${results.length} facture(s) trouvée(s) pour la communication "${communicationNumber}"`);
      return results.slice(0, limit);

    } catch (error: any) {
      console.error('❌ Erreur lors de la recherche par communication:', error.message);
      return [];
    }
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
  async getInvoiceDetails(invoiceId: string): Promise<BillitOrderDetails> {
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

  /**
   * Télécharge le PDF d'une facture sous forme de Buffer
   * @param invoiceId ID de la facture
   * @returns Buffer du PDF ou null si erreur
   */
  async downloadInvoicePdf(invoiceId: string): Promise<Buffer | null> {
    try {
      console.log(`📥 Téléchargement du PDF de la facture ${invoiceId}...`);

      // Étape 1: Récupérer les détails de la facture pour obtenir le FileID
      const orderDetails = await this.getInvoiceDetails(invoiceId);

      if (!orderDetails.OrderPDF || !orderDetails.OrderPDF.FileID) {
        console.error(`❌ Pas de PDF disponible pour la facture ${invoiceId}`);
        return null;
      }

      const fileId = orderDetails.OrderPDF.FileID;
      console.log(`📄 FileID trouvé: ${fileId}`);

      // Étape 2: Télécharger le fichier via l'endpoint /v1/files/{FileID}
      const fileUrl = `${config.billit.apiUrl}/v1/files/${fileId}`;

      const response = await this.axiosInstance.get(fileUrl);

      if (!response.data || !response.data.FileContent) {
        console.error(`❌ Pas de contenu de fichier dans la réponse`);
        return null;
      }

      // Étape 3: Décoder le Base64 pour obtenir le Buffer
      const base64Content = response.data.FileContent;
      const buffer = Buffer.from(base64Content, 'base64');

      console.log(`✅ PDF téléchargé: ${response.data.FileName} (${buffer.length} bytes)`);
      return buffer;
    } catch (error: any) {
      console.error('❌ Erreur lors du téléchargement du PDF:', error.message);
      return null;
    }
  }

  /**
   * Marque une facture comme payée
   * @param invoiceId ID de la facture à marquer comme payée
   * @returns true si succès, false sinon
   */
  async markInvoiceAsPaid(invoiceId: string): Promise<boolean> {
    try {
      console.log(`💰 Marquage de la facture ${invoiceId} comme payée...`);

      // Selon la doc Billit API : PATCH avec Paid et PaidDate
      // NE PAS modifier OrderStatus (champ read-only)
      const patchData = {
        Paid: true,
        PaidDate: new Date().toISOString(),
      };

      const response = await this.axiosInstance.patch(
        `/v1/orders/${invoiceId}`,
        patchData
      );

      console.log(`✅ Facture ${invoiceId} marquée comme payée`);
      return true;
    } catch (error: any) {
      console.error('❌ Erreur lors du marquage de la facture comme payée:');

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
   * Marque une facture comme payée par numéro de facture
   * @param invoiceNumber Numéro de facture
   * @returns true si succès, false sinon
   */
  async markInvoiceAsPaidByNumber(invoiceNumber: string): Promise<boolean> {
    try {
      // D'abord chercher la facture par numéro
      const invoice = await this.findInvoiceByNumber(invoiceNumber);

      if (!invoice) {
        throw new Error(`Facture "${invoiceNumber}" non trouvée`);
      }

      console.log(`📋 Facture trouvée: ${invoice.id} - ${invoice.supplier_name}`);

      // Marquer comme payée avec l'ID
      return await this.markInvoiceAsPaid(invoice.id);
    } catch (error: any) {
      console.error(`❌ Erreur lors du marquage de la facture "${invoiceNumber}":`, error.message);
      throw error;
    }
  }

  /**
   * Marque la facture impayée d'un fournisseur comme payée (intelligent)
   * Cherche automatiquement la facture impayée du fournisseur et la marque comme payée
   * @param supplierName Nom du fournisseur
   * @returns Détails de la facture marquée comme payée
   */
  async markSupplierInvoiceAsPaid(supplierName: string): Promise<{
    success: boolean;
    invoice?: {
      id: string;
      number: string;
      supplier: string;
      amount: number;
      currency: string;
    };
    message: string;
  }> {
    try {
      console.log(`🔍 Recherche de facture impayée pour "${supplierName}"...`);

      // Chercher les factures impayées de ce fournisseur
      const unpaidInvoices = await this.getUnpaidInvoices();
      const supplierInvoices = unpaidInvoices.filter(inv =>
        matchesSupplier(inv.supplier_name, supplierName)
      );

      if (supplierInvoices.length === 0) {
        return {
          success: false,
          message: `Aucune facture impayée trouvée pour "${supplierName}"`,
        };
      }

      // S'il y a plusieurs factures, prendre la plus récente
      const invoice = supplierInvoices.sort((a, b) =>
        new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime()
      )[0];

      console.log(`📋 Facture trouvée: ${invoice.invoice_number} - ${invoice.supplier_name} (${invoice.total_amount} ${invoice.currency})`);

      // Marquer comme payée
      await this.markInvoiceAsPaid(invoice.id);

      return {
        success: true,
        invoice: {
          id: invoice.id,
          number: invoice.invoice_number,
          supplier: invoice.supplier_name,
          amount: invoice.total_amount,
          currency: invoice.currency,
        },
        message: `Facture ${invoice.invoice_number} de ${invoice.supplier_name} (${invoice.total_amount} ${invoice.currency}) marquée comme payée`,
      };
    } catch (error: any) {
      console.error(`❌ Erreur lors du marquage de la facture de "${supplierName}":`, error.message);
      return {
        success: false,
        message: `Erreur: ${error.message}`,
      };
    }
  }
}
