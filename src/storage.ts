import * as fs from 'fs/promises';
import * as path from 'path';
import { NotifiedInvoicesStore } from './types';

export class Storage {
  private filePath: string;
  private store: NotifiedInvoicesStore;

  constructor(filePath: string = 'notified_invoices.json') {
    this.filePath = path.resolve(process.cwd(), filePath);
    this.store = {
      invoices: [],
      lastCheck: new Date().toISOString(),
    };
  }

  /**
   * Charge les données depuis le fichier
   */
  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      this.store = JSON.parse(data);
      console.log(`✓ ${this.store.invoices.length} facture(s) déjà notifiée(s) chargée(s)`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Fichier n'existe pas encore, on utilise le store par défaut
        console.log('✓ Nouveau fichier de stockage initialisé');
        await this.save();
      } else {
        console.error('Erreur lors du chargement du stockage:', error);
        throw error;
      }
    }
  }

  /**
   * Sauvegarde les données dans le fichier
   */
  async save(): Promise<void> {
    try {
      await fs.writeFile(this.filePath, JSON.stringify(this.store, null, 2), 'utf-8');
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du stockage:', error);
      throw error;
    }
  }

  /**
   * Vérifie si une facture a déjà été notifiée
   */
  isNotified(invoiceId: string): boolean {
    return this.store.invoices.includes(invoiceId);
  }

  /**
   * Marque une facture comme notifiée
   */
  async markAsNotified(invoiceId: string): Promise<void> {
    if (!this.isNotified(invoiceId)) {
      this.store.invoices.push(invoiceId);
      await this.save();
    }
  }

  /**
   * Met à jour la date de dernière vérification
   */
  async updateLastCheck(): Promise<void> {
    this.store.lastCheck = new Date().toISOString();
    await this.save();
  }

  /**
   * Obtient la date de dernière vérification
   */
  getLastCheck(): Date {
    return new Date(this.store.lastCheck);
  }

  /**
   * Nettoie les anciennes factures (garde seulement les 1000 dernières)
   */
  async cleanup(keepLast: number = 1000): Promise<void> {
    if (this.store.invoices.length > keepLast) {
      this.store.invoices = this.store.invoices.slice(-keepLast);
      await this.save();
      console.log(`✓ Nettoyage: conservé les ${keepLast} dernières factures`);
    }
  }
}
