/**
 * Compare les résultats de deux benchmarks (avant/après)
 */

import * as fs from 'fs';
import * as path from 'path';
import { BenchmarkReport } from './runner';

interface ComparisonResult {
  before: BenchmarkReport;
  after: BenchmarkReport;
  improvements: {
    accuracyDelta: number; // différence en %
    speedDelta: number; // différence en ms
    speedImprovementPercent: number; // amélioration en %
    scoreDelta: number; // différence de score moyen
  };
}

export class BenchmarkComparator {
  /**
   * Compare deux rapports de benchmark
   */
  compare(beforeFile: string, afterFile: string): ComparisonResult {
    const before = this.loadReport(beforeFile);
    const after = this.loadReport(afterFile);

    const accuracyDelta = ((after.passedTests / after.totalTests) - (before.passedTests / before.totalTests)) * 100;
    const speedDelta = after.averageResponseTime - before.averageResponseTime;
    const speedImprovementPercent = ((before.averageResponseTime - after.averageResponseTime) / before.averageResponseTime) * 100;
    const scoreDelta = after.averageScore - before.averageScore;

    return {
      before,
      after,
      improvements: {
        accuracyDelta: Math.round(accuracyDelta * 10) / 10,
        speedDelta: Math.round(speedDelta),
        speedImprovementPercent: Math.round(speedImprovementPercent * 10) / 10,
        scoreDelta: Math.round(scoreDelta * 10) / 10,
      },
    };
  }

  /**
   * Charge un rapport depuis un fichier
   */
  private loadReport(filename: string): BenchmarkReport {
    const filepath = path.join(process.cwd(), 'data', 'benchmarks', filename);
    const content = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Affiche une comparaison détaillée
   */
  printComparison(comparison: ComparisonResult) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📊 COMPARAISON BENCHMARK - AVANT vs APRÈS`);
    console.log(`${'='.repeat(70)}\n`);

    // Exactitude
    console.log(`🎯 EXACTITUDE:`);
    console.log(`   Avant : ${comparison.before.passedTests}/${comparison.before.totalTests} tests (${Math.round(comparison.before.passedTests / comparison.before.totalTests * 100)}%) - Score moyen: ${comparison.before.averageScore}%`);
    console.log(`   Après : ${comparison.after.passedTests}/${comparison.after.totalTests} tests (${Math.round(comparison.after.passedTests / comparison.after.totalTests * 100)}%) - Score moyen: ${comparison.after.averageScore}%`);

    const accuracyIcon = comparison.improvements.accuracyDelta >= 0 ? '📈' : '📉';
    const scoreIcon = comparison.improvements.scoreDelta >= 0 ? '📈' : '📉';
    console.log(`   ${accuracyIcon} Delta : ${comparison.improvements.accuracyDelta >= 0 ? '+' : ''}${comparison.improvements.accuracyDelta}%`);
    console.log(`   ${scoreIcon} Delta score : ${comparison.improvements.scoreDelta >= 0 ? '+' : ''}${comparison.improvements.scoreDelta} points`);

    // Performance
    console.log(`\n⏱️  PERFORMANCE:`);
    console.log(`   Avant : ${comparison.before.averageResponseTime}ms (médian: ${comparison.before.medianResponseTime}ms)`);
    console.log(`   Après : ${comparison.after.averageResponseTime}ms (médian: ${comparison.after.medianResponseTime}ms)`);

    const speedIcon = comparison.improvements.speedDelta < 0 ? '🚀' : '🐌';
    console.log(`   ${speedIcon} Delta : ${comparison.improvements.speedDelta}ms (${comparison.improvements.speedImprovementPercent >= 0 ? '+' : ''}${comparison.improvements.speedImprovementPercent}% ${comparison.improvements.speedImprovementPercent >= 0 ? 'plus rapide' : 'plus lent'})`);

    // Tests qui ont changé de statut
    console.log(`\n🔄 CHANGEMENTS DE STATUT:`);
    const beforeFailedIds = new Set(comparison.before.results.filter(r => !r.validation.passed).map(r => r.testId));
    const afterFailedIds = new Set(comparison.after.results.filter(r => !r.validation.passed).map(r => r.testId));

    // Tests maintenant réussis
    const nowPassing = comparison.before.results.filter(r => beforeFailedIds.has(r.testId) && !afterFailedIds.has(r.testId));
    if (nowPassing.length > 0) {
      console.log(`   ✅ Maintenant réussis (${nowPassing.length}):`);
      nowPassing.forEach(test => {
        console.log(`      • ${test.testId}: ${test.question}`);
      });
    }

    // Tests maintenant échoués
    const nowFailing = comparison.before.results.filter(r => !beforeFailedIds.has(r.testId) && afterFailedIds.has(r.testId));
    if (nowFailing.length > 0) {
      console.log(`   ❌ Maintenant échoués (${nowFailing.length}):`);
      nowFailing.forEach(test => {
        const afterResult = comparison.after.results.find(r => r.testId === test.testId);
        console.log(`      • ${test.testId}: ${test.question}`);
        if (afterResult) {
          console.log(`        Raison: ${afterResult.validation.failureReasons.join(', ')}`);
        }
      });
    }

    if (nowPassing.length === 0 && nowFailing.length === 0) {
      console.log(`   ℹ️  Aucun changement de statut`);
    }

    // Verdict final
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📋 VERDICT FINAL:`);
    console.log(`${'='.repeat(70)}`);

    const isAccuracyBetter = comparison.improvements.accuracyDelta >= 0;
    const isSpeedBetter = comparison.improvements.speedDelta < 0;
    const isScoreBetter = comparison.improvements.scoreDelta >= 0;

    if (isAccuracyBetter && isSpeedBetter && isScoreBetter) {
      console.log(`   🎉 SUCCÈS ! Amélioration sur tous les fronts !`);
    } else if (isAccuracyBetter && isSpeedBetter) {
      console.log(`   ✅ SUCCÈS ! Meilleure exactitude ET vitesse`);
    } else if (isAccuracyBetter) {
      console.log(`   ⚠️  MIXTE : Exactitude améliorée mais vitesse réduite`);
    } else if (isSpeedBetter) {
      console.log(`   ⚠️  MIXTE : Vitesse améliorée mais exactitude réduite`);
    } else {
      console.log(`   ❌ RÉGRESSION : Exactitude ET vitesse réduites`);
    }

    console.log(`${'='.repeat(70)}\n`);
  }

  /**
   * Trouve automatiquement les derniers fichiers before/after
   */
  findLatestReports(): { before: string | null; after: string | null } {
    const dir = path.join(process.cwd(), 'data', 'benchmarks');

    if (!fs.existsSync(dir)) {
      return { before: null, after: null };
    }

    const files = fs.readdirSync(dir);

    const beforeFiles = files
      .filter(f => f.startsWith('benchmark-before-'))
      .sort()
      .reverse();

    const afterFiles = files
      .filter(f => f.startsWith('benchmark-after-'))
      .sort()
      .reverse();

    return {
      before: beforeFiles[0] || null,
      after: afterFiles[0] || null,
    };
  }
}

// Script CLI
if (require.main === module) {
  const comparator = new BenchmarkComparator();

  const beforeFile = process.argv[2];
  const afterFile = process.argv[3];

  if (!beforeFile || !afterFile) {
    console.log(`Usage: npm run compare <before-file> <after-file>`);
    console.log(`\nOu pour comparaison automatique des derniers rapports:`);
    console.log(`npm run compare:auto`);

    const latest = comparator.findLatestReports();
    if (latest.before && latest.after) {
      console.log(`\n📁 Derniers rapports trouvés:`);
      console.log(`   Before: ${latest.before}`);
      console.log(`   After : ${latest.after}`);
      console.log(`\n💡 Lancer: npm run compare ${latest.before} ${latest.after}`);
    }

    process.exit(1);
  }

  try {
    const comparison = comparator.compare(beforeFile, afterFile);
    comparator.printComparison(comparison);
  } catch (error) {
    console.error(`❌ Erreur:`, error);
    process.exit(1);
  }
}
