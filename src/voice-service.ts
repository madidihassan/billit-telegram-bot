import Groq from 'groq-sdk';
import { config } from './config';
import FormData from 'form-data';
import fs from 'fs';

export class VoiceService {
  private groq: Groq;

  constructor() {
    this.groq = new Groq({
      apiKey: config.groq.apiKey,
    });
  }

  /**
   * Transcrit un fichier audio en texte
   */
  async transcribeAudio(audioPath: string): Promise<string> {
    try {
      console.log('🎤 Transcription audio avec Groq Whisper...');

      // Lire le fichier audio
      const audioFile = fs.createReadStream(audioPath);

      // Envoyer à Groq Whisper
      const transcription = await this.groq.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-large-v3',
        language: 'fr', // Français
        response_format: 'text',
      });

      console.log('✅ Transcription réussie:', transcription);

      return transcription.toString().trim();
    } catch (error: any) {
      console.error('❌ Erreur lors de la transcription:', error.message);
      throw new Error(`Erreur de transcription: ${error.message}`);
    }
  }

  /**
   * Vérifie si l'API Groq est configurée
   */
  isConfigured(): boolean {
    return !!config.groq.apiKey && config.groq.apiKey.length > 0;
  }
}
