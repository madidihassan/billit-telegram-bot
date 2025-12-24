/**
 * Utilitaires pour la manipulation de chaînes de caractères
 */

/**
 * Options pour la normalisation de texte
 */
export interface NormalizeOptions {
  lowercase?: boolean;
  removeSpaces?: boolean;
  removeSpecialChars?: boolean;
  removeDiacritics?: boolean;
  trim?: boolean;
}

/**
 * Normalise un texte pour la recherche et la comparaison
 *
 * @param text - Texte à normaliser
 * @param options - Options de normalisation
 * @returns Texte normalisé
 *
 * @example
 * ```typescript
 * normalize("  Héllo-World  ", { lowercase: true, removeSpaces: true })
 * // Returns: "hello-world"
 *
 * normalize("SI-2500003745", { removeSpecialChars: true })
 * // Returns: "si2500003745"
 * ```
 */
export function normalize(
  text: string,
  options: NormalizeOptions = {}
): string {
  const {
    lowercase = true,
    removeSpaces = false,
    removeSpecialChars = false,
    removeDiacritics = false,
    trim = true,
  } = options;

  let result = text;

  // Trim first
  if (trim) {
    result = result.trim();
  }

  // Lowercase
  if (lowercase) {
    result = result.toLowerCase();
  }

  // Remove diacritics (accents)
  if (removeDiacritics) {
    result = result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // Remove special characters (keep only alphanumeric)
  if (removeSpecialChars) {
    result = result.replace(/[\s\-_\.\/\\]/g, '');
  } else if (removeSpaces) {
    // Just remove spaces
    result = result.replace(/\s+/g, '');
  }

  return result;
}

/**
 * Normalise un terme de recherche (pour compatibilité avec l'ancien code)
 * Enlève les espaces, tirets, underscores, points, slashes et met en minuscules
 *
 * @param text - Texte à normaliser
 * @returns Texte normalisé
 */
export function normalizeSearchTerm(text: string): string {
  return normalize(text, {
    lowercase: true,
    removeSpecialChars: true,
    trim: true,
  });
}

/**
 * Capitalise la première lettre d'un texte
 *
 * @param text - Texte à capitaliser
 * @returns Texte avec première lettre en majuscule
 *
 * @example
 * ```typescript
 * capitalize("hello world")
 * // Returns: "Hello world"
 * ```
 */
export function capitalize(text: string): string {
  if (!text || text.length === 0) {
    return text;
  }
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Capitalise chaque mot d'un texte
 *
 * @param text - Texte à capitaliser
 * @returns Texte avec chaque mot capitalisé
 *
 * @example
 * ```typescript
 * capitalizeWords("hello world")
 * // Returns: "Hello World"
 * ```
 */
export function capitalizeWords(text: string): string {
  if (!text || text.length === 0) {
    return text;
  }
  return text
    .split(/\s+/)
    .map(word => capitalize(word))
    .join(' ');
}

/**
 * Tronque un texte à une longueur maximale
 *
 * @param text - Texte à tronquer
 * @param maxLength - Longueur maximale
 * @param suffix - Suffixe à ajouter si tronqué (par défaut "...")
 * @returns Texte tronqué
 *
 * @example
 * ```typescript
 * truncate("Hello World", 8)
 * // Returns: "Hello..."
 *
 * truncate("Hello World", 8, "…")
 * // Returns: "Hello W…"
 * ```
 */
export function truncate(
  text: string,
  maxLength: number,
  suffix: string = '...'
): string {
  if (!text || text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Vérifie si deux textes sont équivalents après normalisation
 *
 * @param text1 - Premier texte
 * @param text2 - Deuxième texte
 * @param options - Options de normalisation
 * @returns true si les textes sont équivalents
 *
 * @example
 * ```typescript
 * areEquivalent("Hello World", "hello-world", { removeSpaces: true })
 * // Returns: true
 * ```
 */
export function areEquivalent(
  text1: string,
  text2: string,
  options: NormalizeOptions = {}
): boolean {
  const defaultOptions: NormalizeOptions = {
    lowercase: true,
    removeSpaces: true,
    removeSpecialChars: false,
    trim: true,
  };
  const mergedOptions = { ...defaultOptions, ...options };
  return normalize(text1, mergedOptions) === normalize(text2, mergedOptions);
}

/**
 * Extrait uniquement les chiffres d'un texte
 *
 * @param text - Texte source
 * @returns Chaîne contenant uniquement les chiffres
 *
 * @example
 * ```typescript
 * extractDigits("SI-2500003745")
 * // Returns: "2500003745"
 * ```
 */
export function extractDigits(text: string): string {
  return text.replace(/\D/g, '');
}

/**
 * Extrait uniquement les lettres d'un texte
 *
 * @param text - Texte source
 * @returns Chaîne contenant uniquement les lettres
 *
 * @example
 * ```typescript
 * extractLetters("SI-2500003745")
 * // Returns: "SI"
 * ```
 */
export function extractLetters(text: string): string {
  return text.replace(/[^a-zA-Z]/g, '');
}

/**
 * Vérifie si un texte contient un autre texte (insensible à la casse)
 *
 * @param haystack - Texte dans lequel chercher
 * @param needle - Texte à chercher
 * @param normalize - Normaliser les textes avant comparaison
 * @returns true si le texte est trouvé
 *
 * @example
 * ```typescript
 * contains("Hello World", "WORLD")
 * // Returns: true
 *
 * contains("SI-2500003745", "2500", true)
 * // Returns: true (même après normalisation)
 * ```
 */
export function contains(
  haystack: string,
  needle: string,
  normalizeTexts: boolean = false
): boolean {
  if (normalizeTexts) {
    return normalizeSearchTerm(haystack).includes(normalizeSearchTerm(needle));
  }
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Masque partiellement un texte (utile pour masquer des secrets)
 *
 * @param text - Texte à masquer
 * @param visibleStart - Nombre de caractères visibles au début
 * @param visibleEnd - Nombre de caractères visibles à la fin
 * @param maskChar - Caractère de masquage
 * @returns Texte partiellement masqué
 *
 * @example
 * ```typescript
 * maskText("1234567890", 2, 2)
 * // Returns: "12****90"
 *
 * maskText("sk_test_123456", 3, 0, "•")
 * // Returns: "sk_••••••••••"
 * ```
 */
export function maskText(
  text: string,
  visibleStart: number = 0,
  visibleEnd: number = 0,
  maskChar: string = '*'
): string {
  if (!text || text.length <= visibleStart + visibleEnd) {
    return text;
  }

  const start = text.substring(0, visibleStart);
  const end = visibleEnd > 0 ? text.substring(text.length - visibleEnd) : '';
  const maskLength = text.length - visibleStart - visibleEnd;
  const mask = maskChar.repeat(maskLength);

  return start + mask + end;
}

/**
 * Convertit un texte en slug (URL-friendly)
 *
 * @param text - Texte à convertir
 * @returns Slug
 *
 * @example
 * ```typescript
 * slugify("Hello World! This is a Test")
 * // Returns: "hello-world-this-is-a-test"
 * ```
 */
export function slugify(text: string): string {
  return normalize(text, { lowercase: true, removeDiacritics: true })
    .replace(/[^\w\s-]/g, '') // Remove special chars except spaces and hyphens
    .replace(/\s+/g, '-')     // Replace spaces with hyphens
    .replace(/-+/g, '-')      // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Formate un nom propre (capitalise chaque mot, sauf articles)
 *
 * @param text - Nom à formater
 * @returns Nom formaté
 *
 * @example
 * ```typescript
 * formatProperName("jean-paul de la fontaine")
 * // Returns: "Jean-Paul de la Fontaine"
 * ```
 */
export function formatProperName(text: string): string {
  if (!text) return text;

  // Articles et prépositions à ne pas capitaliser (sauf en début)
  const lowerWords = ['de', 'du', 'la', 'le', 'les', 'des', 'et', 'à', 'au'];

  const words = text.toLowerCase().split(/\s+/);

  return words.map((word, index) => {
    // Toujours capitaliser le premier mot
    if (index === 0) {
      return capitalize(word);
    }

    // Ne pas capitaliser les articles/prépositions
    if (lowerWords.includes(word)) {
      return word;
    }

    return capitalize(word);
  }).join(' ');
}
