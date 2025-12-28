/**
 * Service de gestion de la base de données SQLite
 * Gère les utilisateurs, fournisseurs, employés, et autres données dynamiques
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

const DB_PATH = path.join(__dirname, '..', 'data', 'billit.db');
const DATA_DIR = path.dirname(DB_PATH);

// Créer le répertoire data s'il n'existe pas
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Connexion à la base de données
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // Write-Ahead Logging pour de meilleures performances

/**
 * Initialiser le schéma de la base de données
 */
export function initializeDatabase(): void {
  // Table des utilisateurs autorisés (pour le bot Telegram)
  db.exec(`
    CREATE TABLE IF NOT EXISTS authorized_users (
      chat_id TEXT PRIMARY KEY,
      username TEXT,
      role TEXT DEFAULT 'user' CHECK(role IN ('owner', 'admin', 'user')),
      employee_id INTEGER,
      added_by TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active BOOLEAN DEFAULT 1,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );
  `);

  // Table des employés (salariés)
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      chat_id TEXT UNIQUE,
      position TEXT,
      hire_date DATE,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Table des fournisseurs
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT DEFAULT 'fournisseur' CHECK(type IN ('fournisseur', 'partenaire', 'client')),
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Table des alias de fournisseurs
  db.exec(`
    CREATE TABLE IF NOT EXISTS supplier_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL,
      alias TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
      UNIQUE(supplier_id, alias)
    );
  `);

  // Index pour les recherches rapides
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_supplier_aliases_alias ON supplier_aliases(alias);
    CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
    CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name);
  `);

  console.log('✅ Base de données initialisée avec succès');
}

// ============================================================
// GESTION DES UTILISATEURS AUTORISÉS
// ============================================================

export interface AuthorizedUser {
  chat_id: string;
  username: string | null;
  role: 'owner' | 'admin' | 'user';
  employee_id: number | null;
  added_by: string | null;
  added_at: string;
  is_active: boolean;
}

/**
 * Récupérer tous les utilisateurs autorisés actifs
 */
export function getAllAuthorizedUsers(): AuthorizedUser[] {
  const stmt = db.prepare(`
    SELECT * FROM authorized_users
    WHERE is_active = 1
    ORDER BY added_at
  `);
  return stmt.all() as AuthorizedUser[];
}

/**
 * Récupérer un utilisateur par Chat ID
 */
export function getUserByChatId(chatId: string): AuthorizedUser | null {
  const stmt = db.prepare(`
    SELECT * FROM authorized_users
    WHERE chat_id = ? AND is_active = 1
  `);
  return (stmt.get(chatId) as AuthorizedUser) || null;
}

/**
 * Ajouter un utilisateur autorisé
 */
export function addAuthorizedUser(
  chatId: string,
  username: string | null,
  role: 'owner' | 'admin' | 'user' = 'user',
  addedBy: string | null = null
): boolean {
  try {
    const stmt = db.prepare(`
      INSERT INTO authorized_users (chat_id, username, role, added_by)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(chatId, username, role, addedBy);
    return true;
  } catch (error) {
    console.error('Erreur lors de l\'ajout de l\'utilisateur:', error);
    return false;
  }
}

/**
 * Supprimer un utilisateur (désactiver)
 */
export function removeAuthorizedUser(chatId: string): boolean {
  try {
    const stmt = db.prepare(`
      UPDATE authorized_users
      SET is_active = 0
      WHERE chat_id = ?
    `);
    const result = stmt.run(chatId);
    return result.changes > 0;
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'utilisateur:', error);
    return false;
  }
}

/**
 * Vérifier si un utilisateur est autorisé
 */
export function isUserAuthorized(chatId: string): boolean {
  const user = getUserByChatId(chatId);
  return user !== null;
}

// ============================================================
// GESTION DES EMPLOYÉS
// ============================================================

export interface Employee {
  id: number;
  name: string;
  chat_id: string | null;
  position: string | null;
  hire_date: string | null;
  is_active: boolean;
  created_at: string;
}

/**
 * Récupérer tous les employés actifs
 */
export function getAllEmployees(): Employee[] {
  const stmt = db.prepare(`
    SELECT * FROM employees
    WHERE is_active = 1
    ORDER BY name
  `);
  return stmt.all() as Employee[];
}

/**
 * Ajouter un employé
 */
export function addEmployee(
  name: string,
  chatId: string | null = null,
  position: string | null = null,
  hireDate: string | null = null
): number | null {
  try {
    const stmt = db.prepare(`
      INSERT INTO employees (name, chat_id, position, hire_date)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(name, chatId, position, hireDate);
    return result.lastInsertRowid as number;
  } catch (error) {
    console.error('Erreur lors de l\'ajout de l\'employé:', error);
    return null;
  }
}

/**
 * Récupérer un employé par son nom
 */
export function getEmployeeByName(name: string): Employee | null {
  const stmt = db.prepare(`
    SELECT * FROM employees
    WHERE LOWER(name) = LOWER(?) AND is_active = 1
    LIMIT 1
  `);
  return (stmt.get(name) as Employee) || null;
}

/**
 * Vérifier si un employé existe (actif ou inactif) par son nom
 */
export function employeeExistsByName(name: string): Employee | null {
  const stmt = db.prepare(`
    SELECT * FROM employees
    WHERE LOWER(name) = LOWER(?)
    LIMIT 1
  `);
  return (stmt.get(name) as Employee) || null;
}

/**
 * Supprimer un employé (désactiver)
 */
export function removeEmployee(employeeId: number): boolean {
  try {
    const stmt = db.prepare(`
      UPDATE employees
      SET is_active = 0
      WHERE id = ?
    `);
    const result = stmt.run(employeeId);
    return result.changes > 0;
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'employé:', error);
    return false;
  }
}

/**
 * Supprimer complètement un employé de la base de données (suppression permanente)
 * ⚠️ Cette action est irréversible
 */
export function deleteEmployeePermanently(employeeId: number): boolean {
  try {
    const stmt = db.prepare(`
      DELETE FROM employees
      WHERE id = ?
    `);
    const result = stmt.run(employeeId);
    return result.changes > 0;
  } catch (error) {
    console.error('Erreur lors de la suppression permanente de l\'employé:', error);
    return false;
  }
}

// ============================================================
// GESTION DES FOURNISSEURS
// ============================================================

export interface Supplier {
  id: number;
  name: string;
  type: 'fournisseur' | 'partenaire' | 'client';
  is_active: boolean;
  created_at: string;
}

/**
 * Récupérer tous les fournisseurs actifs
 */
export function getAllSuppliers(): Supplier[] {
  const stmt = db.prepare(`
    SELECT * FROM suppliers
    WHERE is_active = 1
    ORDER BY name
  `);
  return stmt.all() as Supplier[];
}

/**
 * Ajouter un fournisseur avec ses alias
 */
export function addSupplier(
  name: string,
  aliases: string[] = [],
  type: 'fournisseur' | 'partenaire' | 'client' = 'fournisseur'
): number | null {
  try {
    // Insérer le fournisseur
    const stmtSupplier = db.prepare(`
      INSERT INTO suppliers (name, type)
      VALUES (?, ?)
    `);
    const result = stmtSupplier.run(name, type);
    const supplierId = result.lastInsertRowid as number;

    // Insérer les alias
    if (aliases.length > 0) {
      const stmtAlias = db.prepare(`
        INSERT INTO supplier_aliases (supplier_id, alias)
        VALUES (?, ?)
      `);
      for (const alias of aliases) {
        stmtAlias.run(supplierId, alias.toLowerCase());
      }
    }

    return supplierId;
  } catch (error) {
    console.error('Erreur lors de l\'ajout du fournisseur:', error);
    return null;
  }
}

/**
 * Supprimer un fournisseur (désactiver)
 */
export function removeSupplier(supplierId: number): boolean {
  try {
    const stmt = db.prepare(`
      UPDATE suppliers
      SET is_active = 0
      WHERE id = ?
    `);
    const result = stmt.run(supplierId);
    return result.changes > 0;
  } catch (error) {
    console.error('Erreur lors de la suppression du fournisseur:', error);
    return false;
  }
}

/**
 * Supprimer TOUS les fournisseurs (DELETE permanent)
 * ⚠️ Cette action est irréversible
 */
export function deleteAllSuppliers(): number {
  try {
    // Supprimer d'abord tous les alias (CASCADE devrait le faire automatiquement, mais soyons sûrs)
    const stmtAliases = db.prepare(`DELETE FROM supplier_aliases`);
    const resultAliases = stmtAliases.run();

    // Supprimer tous les fournisseurs
    const stmtSuppliers = db.prepare(`DELETE FROM suppliers`);
    const resultSuppliers = stmtSuppliers.run();

    console.log(`🗑️  ${resultSuppliers.changes} fournisseur(s) supprimé(s) de la base de données`);
    console.log(`🗑️  ${resultAliases.changes} alias supprimé(s) de la base de données`);

    return resultSuppliers.changes;
  } catch (error) {
    console.error('Erreur lors de la suppression de tous les fournisseurs:', error);
    return 0;
  }
}

/**
 * Rechercher un fournisseur par nom ou alias
 */
export function findSupplierByNameOrAlias(search: string): Supplier | null {
  const searchLower = search.toLowerCase();

  // Recherche d'abord par alias
  const stmtAlias = db.prepare(`
    SELECT s.* FROM suppliers s
    INNER JOIN supplier_aliases sa ON s.id = sa.supplier_id
    WHERE LOWER(sa.alias) = ? AND s.is_active = 1
    LIMIT 1
  `);
  let supplier = stmtAlias.get(searchLower) as Supplier;

  // Si pas trouvé, recherche par nom
  if (!supplier) {
    const stmtName = db.prepare(`
      SELECT * FROM suppliers
      WHERE LOWER(name) = ? AND is_active = 1
      LIMIT 1
    `);
    supplier = stmtName.get(searchLower) as Supplier;
  }

  return supplier || null;
}

/**
 * Récupérer tous les alias d'un fournisseur
 */
export function getSupplierAliases(supplierId: number): string[] {
  const stmt = db.prepare(`
    SELECT alias FROM supplier_aliases
    WHERE supplier_id = ?
    ORDER BY alias
  `);
  const rows = stmt.all(supplierId) as { alias: string }[];
  return rows.map(row => row.alias);
}

// ============================================================
// BACKUP ET MAINTENANCE
// ============================================================

/**
 * Créer un backup de la base de données
 */
export function createBackup(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(DATA_DIR, 'backups', `billit-${timestamp}.db`);

  // Créer le répertoire de backup s'il n'existe pas
  const backupDir = path.dirname(backupPath);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Copier la base de données
  db.backup(backupPath);

  console.log(`✅ Backup créé: ${backupPath}`);
  return backupPath;
}

/**
 * Fermer proprement la base de données
 */
export function closeDatabase(): void {
  db.close();
  console.log('✅ Connexion à la base de données fermée');
}

// Initialiser la base de données au chargement du module
initializeDatabase();

export default db;
