export interface BillitInvoiceLine {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  vat_rate: number;
  vat_amount: number;
}

export interface BillitInvoiceDetail {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  total_excl_vat: number;
  total_vat: number;
  currency: string;
  supplier_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  communication?: string;
  lines: BillitInvoiceLine[];
  pdf_url?: string;
}

export interface BillitInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  currency: string;
  supplier_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  communication?: string; // Référence de paiement / communication
}

export interface BillitInvoicesResponse {
  data: BillitInvoice[];
  meta?: {
    current_page: number;
    total: number;
    per_page: number;
  };
}

export interface NotifiedInvoicesStore {
  invoices: string[];
  lastCheck: string;
}
