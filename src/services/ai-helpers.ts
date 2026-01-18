/**
 * Services d'aide IA pour matching et parsing intelligents
 * Remplace les règles en dur par des analyses IA contextuelles
 *
 * @module AIHelpers
 * @category Services
 */

import Groq from 'groq-sdk';
import OpenAI from 'openai';

interface AIProvider {
  type: 'groq' | 'openrouter';
  client: Groq | OpenAI;
}

/**
 * 🤖 Matching intelligent de fournisseur
 * Trouve le bon fournisseur même avec fautes de frappe, accents, abréviations
 *
 * @param searchTerm - Terme recherché (ex: "verisur", "kbc", "foster")
 * @param suppliers - Liste des fournisseurs réels disponibles
 * @param provider - Provider IA à utiliser
 * @returns Nom exact du fournisseur ou null si non trouvé
 *
 * @example
 * const match = await aiMatchSupplier("verisur", ["VERISURE SA", "Vivaqua", ...], provider);
 * // → "VERISURE SA"
 */
export async function aiMatchSupplier(
  searchTerm: string,
  suppliers: string[],
  provider: AIProvider
): Promise<string | null> {
  try {
    const prompt = `Tu es un assistant de matching de fournisseurs.

Utilisateur cherche: "${searchTerm}"

Fournisseurs disponibles:
${suppliers.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Trouve le fournisseur le PLUS PROBABLE que l'utilisateur cherche.
Considère: fautes de frappe, abréviations, accents, ordre des mots.

Réponds UNIQUEMENT avec:
- Le nom EXACT du fournisseur (copié depuis la liste)
- OU "null" si aucun ne correspond

Réponse:`;

    let response;
    if (provider.type === 'openrouter') {
      const openrouter = provider.client as OpenAI;
      response = await openrouter.chat.completions.create({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 100,
      });
    } else {
      const groq = provider.client as Groq;
      response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 100,
      });
    }

    const result = response.choices[0]?.message?.content?.trim() || 'null';

    // Vérification de sécurité : le résultat DOIT être dans la liste
    if (result === 'null') {
      console.log(`🔍 aiMatchSupplier: "${searchTerm}" → Aucun match trouvé`);
      return null;
    }

    if (!suppliers.includes(result)) {
      console.warn(`⚠️ aiMatchSupplier: L'IA a retourné "${result}" qui n'est pas dans la liste des fournisseurs`);
      // Fuzzy fallback: chercher le plus proche
      const normalized = result.toLowerCase().trim();
      const match = suppliers.find(s => s.toLowerCase().trim() === normalized);
      if (match) {
        console.log(`🔍 aiMatchSupplier: "${searchTerm}" → "${match}" (fuzzy fallback)`);
        return match;
      }
      return null;
    }

    console.log(`🤖 aiMatchSupplier: "${searchTerm}" → "${result}"`);
    return result;

  } catch (error) {
    console.error('❌ Erreur aiMatchSupplier:', error);
    return null;
  }
}

/**
 * 🤖 Matching intelligent d'employé
 * Trouve le bon employé même avec prénom seul, nom seul, surnoms, etc.
 *
 * @param searchTerm - Terme recherché (ex: "sufjan", "jawad", "hassan")
 * @param employees - Liste des employés réels disponibles (format "Prénom Nom")
 * @param provider - Provider IA à utiliser
 * @returns Nom complet exact de l'employé ou null si non trouvé
 *
 * @example
 * const match = await aiMatchEmployee("sufjan", ["Soufiane Madidi", "Jawad Madidi", ...], provider);
 * // → "Soufiane Madidi"
 */
export async function aiMatchEmployee(
  searchTerm: string,
  employees: string[],
  provider: AIProvider
): Promise<string | null> {
  try {
    const prompt = `Tu es un assistant de matching d'employés.

Utilisateur cherche: "${searchTerm}"

Employés disponibles:
${employees.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Trouve l'employé le PLUS PROBABLE que l'utilisateur cherche.
Considère: prénom seul, nom seul, surnoms, diminutifs, fautes de frappe.

Exemples:
- "sufjan" → "Soufiane Madidi" (variation du prénom)
- "jawad" → "Jawad Madidi" (prénom seul)
- "madidi" → Si plusieurs Madidi, retourne null (ambigu)

Réponds UNIQUEMENT avec:
- Le nom EXACT de l'employé (copié depuis la liste)
- OU "null" si aucun ne correspond OU si ambigu (plusieurs matches possibles)

Réponse:`;

    let response;
    if (provider.type === 'openrouter') {
      const openrouter = provider.client as OpenAI;
      response = await openrouter.chat.completions.create({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 100,
      });
    } else {
      const groq = provider.client as Groq;
      response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 100,
      });
    }

    const result = response.choices[0]?.message?.content?.trim() || 'null';

    // Vérification de sécurité
    if (result === 'null') {
      console.log(`🔍 aiMatchEmployee: "${searchTerm}" → Aucun match trouvé`);
      return null;
    }

    if (!employees.includes(result)) {
      console.warn(`⚠️ aiMatchEmployee: L'IA a retourné "${result}" qui n'est pas dans la liste`);
      const normalized = result.toLowerCase().trim();
      const match = employees.find(e => e.toLowerCase().trim() === normalized);
      if (match) {
        console.log(`🔍 aiMatchEmployee: "${searchTerm}" → "${match}" (fuzzy fallback)`);
        return match;
      }
      return null;
    }

    console.log(`🤖 aiMatchEmployee: "${searchTerm}" → "${result}"`);
    return result;

  } catch (error) {
    console.error('❌ Erreur aiMatchEmployee:', error);
    return null;
  }
}

/**
 * 🤖 Parsing intelligent de période
 * Convertit du langage naturel en dates précises
 *
 * @param text - Texte décrivant la période (ex: "année 2025", "janvier", "ce trimestre")
 * @param provider - Provider IA à utiliser
 * @returns Objet avec start/end Date ou null si impossible à parser
 *
 * @example
 * const period = await aiParsePeriod("année 2025", provider);
 * // → { start: Date(2025-01-01), end: Date(2025-12-31) }
 */
export async function aiParsePeriod(
  text: string,
  provider: AIProvider
): Promise<{ start: Date; end: Date; description: string } | null> {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12

    const prompt = `Tu es un assistant de parsing de dates.

Date actuelle: ${now.toISOString().split('T')[0]} (${currentYear}-${String(currentMonth).padStart(2, '0')})

Texte utilisateur: "${text}"

Parse cette période en dates de début et fin.

Règles importantes:
- "année 2025" → 2025-01-01 à 2025-12-31 (PAS 2026-01-XX !)
- "janvier" (on est en janvier 2026) → 2026-01-01 à 2026-01-31
- "décembre" (on est en janvier 2026) → 2025-12-01 à 2025-12-31 (mois précédent)
- "ce mois" → ${currentYear}-${String(currentMonth).padStart(2, '0')}-01 à fin du mois
- "mois dernier" → mois précédent
- "cette année" → ${currentYear}-01-01 à ${currentYear}-12-31

Réponds UNIQUEMENT avec un JSON:
{
  "start": "YYYY-MM-DD",
  "end": "YYYY-MM-DD",
  "description": "janvier 2026" (description lisible)
}

Si impossible à parser, retourne: {"error": "raison"}

Réponse JSON:`;

    let response;
    if (provider.type === 'openrouter') {
      const openrouter = provider.client as OpenAI;
      response = await openrouter.chat.completions.create({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 200,
      });
    } else {
      const groq = provider.client as Groq;
      response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 200,
      });
    }

    const content = response.choices[0]?.message?.content?.trim() || '{}';

    // Parser le JSON
    const parsed = JSON.parse(content);

    if (parsed.error) {
      console.log(`🔍 aiParsePeriod: "${text}" → Impossible à parser (${parsed.error})`);
      return null;
    }

    if (!parsed.start || !parsed.end) {
      console.warn(`⚠️ aiParsePeriod: Réponse invalide:`, parsed);
      return null;
    }

    const start = new Date(parsed.start);
    const end = new Date(parsed.end);

    // Validation des dates
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      console.warn(`⚠️ aiParsePeriod: Dates invalides:`, { start: parsed.start, end: parsed.end });
      return null;
    }

    if (start > end) {
      console.warn(`⚠️ aiParsePeriod: start > end:`, { start, end });
      return null;
    }

    console.log(`🤖 aiParsePeriod: "${text}" → ${parsed.start} à ${parsed.end} (${parsed.description})`);

    return {
      start,
      end: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59),
      description: parsed.description || text
    };

  } catch (error) {
    console.error('❌ Erreur aiParsePeriod:', error);
    return null;
  }
}
