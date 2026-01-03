import type { EmbeddedChunk } from './embeddings.js';
import { autoCluster, labelClusters, clusterCoherence, findMostSimilarPairs, type Cluster } from './vectors.js';

export interface SemanticPattern {
  name: string;
  description: string;
  confidence: 'observed' | 'inferred' | 'uncertain';
  evidence: string[];
  files: string[];
  similarity?: number;
}

export interface AnalysisResult {
  patterns: SemanticPattern[];
  clusters: Cluster[];
  crossFilePatterns: SemanticPattern[];
  anomalies: EmbeddedChunk[];
}

function uniqueFiles(chunks: EmbeddedChunk[]): string[] {
  return [...new Set(chunks.map(c => c.file))];
}

export function analyzeEmbeddings(chunks: EmbeddedChunk[]): AnalysisResult {
  const patterns: SemanticPattern[] = [];
  const crossFilePatterns: SemanticPattern[] = [];
  const anomalies: EmbeddedChunk[] = [];

  // Cluster chunks
  const rawClusters = autoCluster(chunks);
  const clusters = labelClusters(rawClusters);

  // Analyze each cluster
  for (const cluster of clusters) {
    if (cluster.chunks.length < 2) {
      // Single-chunk clusters might be anomalies
      anomalies.push(...cluster.chunks);
      continue;
    }

    const coherence = clusterCoherence(cluster);
    const files = uniqueFiles(cluster.chunks);

    // High coherence = strong pattern
    if (coherence >= 0.85 && cluster.label) {
      patterns.push({
        name: cluster.label,
        description: `${cluster.chunks.length} similar code units`,
        confidence: 'observed',
        evidence: [
          `Cluster coherence: ${(coherence * 100).toFixed(1)}%`,
          `Found in ${files.length} files`,
        ],
        files: files.slice(0, 5),
        similarity: coherence,
      });
    } else if (coherence >= 0.7) {
      patterns.push({
        name: cluster.label || `Pattern #${cluster.id}`,
        description: `${cluster.chunks.length} moderately similar code units`,
        confidence: 'inferred',
        evidence: [
          `Cluster coherence: ${(coherence * 100).toFixed(1)}%`,
        ],
        files: files.slice(0, 3),
        similarity: coherence,
      });
    }
  }

  // Find cross-file patterns via similarity pairs
  const similarPairs = findMostSimilarPairs(chunks, 0.9);

  // Group similar pairs by pattern type
  const pairPatterns: Map<string, { files: Set<string>; count: number; avgSim: number }> = new Map();

  for (const { a, b, similarity } of similarPairs.slice(0, 50)) {
    // Try to identify pattern type from names
    const namePattern = findCommonPattern(a.name, b.name);
    if (namePattern) {
      const existing = pairPatterns.get(namePattern);
      if (existing) {
        existing.files.add(a.file);
        existing.files.add(b.file);
        existing.count++;
        existing.avgSim = (existing.avgSim * (existing.count - 1) + similarity) / existing.count;
      } else {
        pairPatterns.set(namePattern, {
          files: new Set([a.file, b.file]),
          count: 1,
          avgSim: similarity,
        });
      }
    }
  }

  // Convert pair patterns to cross-file patterns
  for (const [pattern, data] of pairPatterns) {
    if (data.count >= 2 && data.files.size >= 2) {
      crossFilePatterns.push({
        name: pattern,
        description: `Repeated across ${data.files.size} files`,
        confidence: data.avgSim >= 0.95 ? 'observed' : 'inferred',
        evidence: [
          `${data.count} similar pairs found`,
          `Average similarity: ${(data.avgSim * 100).toFixed(1)}%`,
        ],
        files: [...data.files].slice(0, 5),
        similarity: data.avgSim,
      });
    }
  }

  return { patterns, clusters, crossFilePatterns, anomalies };
}

function findCommonPattern(name1: string, name2: string): string | null {
  // Look for common suffixes
  const suffixes = [
    'Service', 'Repository', 'Controller', 'Handler',
    'Middleware', 'Util', 'Utils', 'Helper', 'Manager',
    'Factory', 'Provider', 'Validator', 'Parser',
  ];

  for (const suffix of suffixes) {
    if (name1.endsWith(suffix) && name2.endsWith(suffix)) {
      return `${suffix} pattern`;
    }
  }

  // Look for common prefixes
  const prefixes = ['get', 'set', 'create', 'update', 'delete', 'find', 'fetch', 'handle', 'process'];
  for (const prefix of prefixes) {
    if (name1.toLowerCase().startsWith(prefix) && name2.toLowerCase().startsWith(prefix)) {
      return `${prefix}* methods`;
    }
  }

  return null;
}

export function summarizeAnalysis(result: AnalysisResult): string[] {
  const summary: string[] = [];

  // Strong patterns
  const strongPatterns = result.patterns.filter(p => p.confidence === 'observed');
  for (const p of strongPatterns) {
    summary.push(`Strong: ${p.name} (${p.similarity ? (p.similarity * 100).toFixed(0) + '% similar' : p.description})`);
  }

  // Cross-file patterns
  for (const p of result.crossFilePatterns.slice(0, 3)) {
    summary.push(`Cross-file: ${p.name} in ${p.files.length} files`);
  }

  // Anomalies
  if (result.anomalies.length > 0) {
    summary.push(`Anomalies: ${result.anomalies.length} chunks don't fit patterns`);
  }

  return summary;
}
