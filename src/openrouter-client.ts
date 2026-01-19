import axios, { AxiosInstance } from 'axios';
import OpenAI from 'openai';

/**
 * Client OpenRouter pour utiliser GPT-4o-mini et autres modèles
 * Alternative à Groq quand on atteint les limites de taux
 */
export class OpenRouterClient {
  private axiosInstance: AxiosInstance;
  private model: string;
  private openaiClient: OpenAI | null = null;

  constructor(model?: string) {
    // Modèle par défaut: GPT-4o-mini (le moins cher et excellent pour function calling)
    this.model = model || process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

    this.axiosInstance = axios.create({
      baseURL: 'https://openrouter.ai/api/v1',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://billit.tonton202.be',
        'X-Title': 'Billit Bot',
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Retourne un client OpenAI compatible pour ai-helpers.ts
   * Crée un vrai client OpenAI qui utilise OpenRouter en backend
   */
  getOpenAICompatibleClient(): OpenAI {
    if (!this.openaiClient) {
      this.openaiClient = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY,
        defaultHeaders: {
          'HTTP-Referer': 'https://billit.tonton202.be',
          'X-Title': 'Billit Bot',
        },
      });
    }
    return this.openaiClient;
  }

  /**
   * Envoie une requête de chat completion avec function calling
   * Compatible avec l'API Groq (même interface)
   */
  async chatCompletion(params: {
    messages: Array<{
      role: 'system' | 'user' | 'assistant' | 'tool';
      content: string;
      tool_call_id?: string;
    }>;
    tools?: Array<{
      type: string;
      function: {
        name: string;
        description: string;
        parameters: any;
      };
    }>;
    tool_choice?: 'auto' | 'none';
    temperature?: number;
    max_tokens?: number;
  }): Promise<{
    choices: Array<{
      message: {
        role: string;
        content: string | null;
        tool_calls?: Array<{
          id: string;
          type: string;
          function: {
            name: string;
            arguments: string;
          };
        }>;
      };
    }>;
  }> {
    try {
      const response = await this.axiosInstance.post('/chat/completions', {
        model: this.model,
        messages: params.messages,
        tools: params.tools,
        tool_choice: params.tool_choice,
        temperature: params.temperature || 0.3,
        max_tokens: params.max_tokens || 1000,
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 429) {
        throw new Error(`Rate limit atteint pour ${this.model}. Essayez un autre modèle ou attendez.`);
      }

      console.error('❌ Erreur OpenRouter:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Vérifie si OpenRouter est configuré
   */
  isConfigured(): boolean {
    return !!process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.length > 0;
  }

  /**
   * Retourne le modèle utilisé
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Liste des modèles recommandés avec leurs prix
   */
  static getRecommendedModels() {
    return {
      'openai/gpt-4o-mini': { price: '$0.15/1M tokens', quality: '⭐⭐⭐⭐', speed: 'Ultra rapide' },
      'deepseek/deepseek-chat': { price: '$0.27/1M tokens', quality: '⭐⭐⭐⭐⭐', speed: 'Rapide' },
      'meta-llama/llama-3.1-70b-instruct': { price: '$0.59/1M tokens', quality: '⭐⭐⭐⭐', speed: 'Rapide' },
      'anthropic/claude-3.5-haiku': { price: '$1/1M tokens', quality: '⭐⭐⭐⭐⭐', speed: 'Rapide' },
      'qwen/qwen-2.5-72b-instruct': { price: '$0.35/1M tokens', quality: '⭐⭐⭐⭐', speed: 'Rapide' },
    };
  }
}
