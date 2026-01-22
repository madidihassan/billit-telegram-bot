/**
 * Runner de benchmark pour tester vitesse et exactitude
 */

import { AIAgentServiceV2 } from '../ai-agent-service-v2';
import { CommandHandler } from '../command-handler';
import { testQuestions, TestQuestion } from './test-questions';
import { ResponseValidator, ValidationResult } from './validator';
import * as fs from 'fs';
import * as path from 'path';

export interface BenchmarkResult {
  testId: string;
  category: string;
  question: string;
  response: string;
  responseTime: number; // en ms
  toolsCalled: string[];
  validation: ValidationResult;
  timestamp: string;
}

export interface BenchmarkReport {
  version: string; // "before" ou "after"
  totalTests: number;
  passedTests: number;
  failedTests: number;
  averageResponseTime: number;
  medianResponseTime: number;
  averageScore: number;
  results: BenchmarkResult[];
  timestamp: string;
}

export class BenchmarkRunner {
  private aiAgent: AIAgentServiceV2;
  private validator: ResponseValidator;
  private currentToolsCalled: string[] = [];

  constructor(commandHandler: CommandHandler) {
    this.aiAgent = new AIAgentServiceV2(commandHandler);
    this.validator = new ResponseValidator();

    // Hook pour capturer les outils appelés
    this.setupToolTracking();
  }

  /**
   * Configure le tracking des outils appelés
   */
  private setupToolTracking() {
    // On va wrapper la méthode processQuestion pour tracker les tools
    const originalProcessQuestion = this.aiAgent.processQuestion.bind(this.aiAgent);

    this.aiAgent.processQuestion = async (question: string, chatId?: string): Promise<string> => {
      this.currentToolsCalled = []; // Reset
      const response = await originalProcessQuestion(question, chatId);
      return response;
    };
  }

  /**
   * Exécute tous les tests de benchmark
   */
  async runBenchmark(version: string = 'current'): Promise<BenchmarkReport> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 BENCHMARK ${version.toUpperCase()} - Début`);
    console.log(`${'='.repeat(60)}\n`);

    const results: BenchmarkResult[] = [];
    let totalTime = 0;

    for (let i = 0; i < testQuestions.length; i++) {
      const testQuestion = testQuestions[i];
      console.log(`\n[${i + 1}/${testQuestions.length}] 🧪 Test: ${testQuestion.id}`);
      console.log(`   Question: "${testQuestion.question}"`);

      const result = await this.runSingleTest(testQuestion);
      results.push(result);
      totalTime += result.responseTime;

      // Afficher le résultat immédiatement
      const passIcon = result.validation.passed ? '✅' : '❌';
      console.log(`   ${passIcon} Score: ${result.validation.score}% | Temps: ${result.responseTime}ms`);

      if (!result.validation.passed) {
        console.log(`   ⚠️  Raisons: ${result.validation.failureReasons.join(', ')}`);
      }

      // Pause de 500ms entre chaque test pour ne pas surcharger l'API
      await this.sleep(500);
    }

    // Calculer les statistiques
    const report = this.generateReport(version, results);

    // Sauvegarder le rapport
    this.saveReport(report);

    // Afficher le résumé
    this.printSummary(report);

    return report;
  }

  /**
   * Exécute un test unique
   */
  private async runSingleTest(testQuestion: TestQuestion): Promise<BenchmarkResult> {
    const startTime = Date.now();

    try {
      // Réinitialiser le tracking
      this.currentToolsCalled = [];

      // Exécuter la question
      const response = await this.aiAgent.processQuestion(testQuestion.question);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Récupérer les outils appelés directement depuis l'agent IA
      const toolsCalled = this.aiAgent.lastToolsCalled;

      // Valider la réponse
      const validation = this.validator.validate(testQuestion, response, toolsCalled);

      return {
        testId: testQuestion.id,
        category: testQuestion.category,
        question: testQuestion.question,
        response,
        responseTime,
        toolsCalled,
        validation,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      return {
        testId: testQuestion.id,
        category: testQuestion.category,
        question: testQuestion.question,
        response: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
        responseTime,
        toolsCalled: [],
        validation: {
          passed: false,
          score: 0,
          details: {
            mustContainPassed: false,
            mustNotContainPassed: false,
            patternMatchPassed: false,
            toolCheckPassed: false,
            dataPointsPassed: false,
          },
          failureReasons: [`Erreur d'exécution: ${error instanceof Error ? error.message : String(error)}`],
        },
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Extrait les noms d'outils appelés depuis la réponse ou les logs
   */
  private extractToolsFromResponse(response: string): string[] {
    const tools: string[] = [];

    // Patterns pour détecter les outils dans les logs ou la réponse
    const toolPatterns = [
      /get_recent_invoices/g,
      /get_all_invoices/g,
      /get_unpaid_invoices/g,
      /get_overdue_invoices/g,
      /get_invoices_by_month/g,
      /get_last_n_invoices/g,
      /get_employee_salaries/g,
      /compare_employee_salaries/g,
      /analyze_supplier_expenses/g,
      /get_supplier_ranking/g,
      /compare_supplier_expenses/g,
      /get_period_transactions/g,
      /predict_next_month/g,
      /get_supplier_invoices/g,
    ];

    for (const pattern of toolPatterns) {
      const matches = response.match(pattern);
      if (matches) {
        const toolName = matches[0];
        if (!tools.includes(toolName)) {
          tools.push(toolName);
        }
      }
    }

    return tools;
  }

  /**
   * Génère le rapport de benchmark
   */
  private generateReport(version: string, results: BenchmarkResult[]): BenchmarkReport {
    const passedTests = results.filter(r => r.validation.passed).length;
    const failedTests = results.length - passedTests;

    const responseTimes = results.map(r => r.responseTime);
    const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

    const sortedTimes = [...responseTimes].sort((a, b) => a - b);
    const medianResponseTime = sortedTimes[Math.floor(sortedTimes.length / 2)];

    const scores = results.map(r => r.validation.score);
    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    return {
      version,
      totalTests: results.length,
      passedTests,
      failedTests,
      averageResponseTime: Math.round(averageResponseTime),
      medianResponseTime: Math.round(medianResponseTime),
      averageScore: Math.round(averageScore * 10) / 10,
      results,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Sauvegarde le rapport dans data/benchmarks/
   */
  private saveReport(report: BenchmarkReport) {
    const dir = path.join(process.cwd(), 'data', 'benchmarks');

    // Créer le dossier s'il n'existe pas
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filename = `benchmark-${report.version}-${Date.now()}.json`;
    const filepath = path.join(dir, filename);

    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));

    console.log(`\n💾 Rapport sauvegardé: ${filepath}`);
  }

  /**
   * Affiche un résumé du benchmark
   */
  private printSummary(report: BenchmarkReport) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 RÉSUMÉ DU BENCHMARK - ${report.version.toUpperCase()}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\n🎯 Exactitude:`);
    console.log(`   ✅ Tests réussis: ${report.passedTests}/${report.totalTests} (${Math.round(report.passedTests / report.totalTests * 100)}%)`);
    console.log(`   ❌ Tests échoués: ${report.failedTests}/${report.totalTests}`);
    console.log(`   📈 Score moyen: ${report.averageScore}%`);

    console.log(`\n⏱️  Performance:`);
    console.log(`   📊 Temps moyen: ${report.averageResponseTime}ms`);
    console.log(`   📊 Temps médian: ${report.medianResponseTime}ms`);

    console.log(`\n❌ Tests échoués:`);
    const failedTests = report.results.filter(r => !r.validation.passed);
    if (failedTests.length === 0) {
      console.log(`   ✨ Aucun échec !`);
    } else {
      failedTests.forEach(test => {
        console.log(`   • ${test.testId}: ${test.question}`);
        console.log(`     Score: ${test.validation.score}% | ${test.validation.failureReasons.join(', ')}`);
      });
    }

    console.log(`\n${'='.repeat(60)}\n`);
  }

  /**
   * Pause pour X ms
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
