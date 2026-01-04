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

// Generate a meaningful description based on the pattern label
function generatePatternDescription(cluster: Cluster, fileCount: number): string {
  const label = cluster.label || '';
  const count = cluster.chunks.length;

  // Check for architecture patterns in the label
  if (label.includes('BLoC')) {
    return `BLoC architecture pattern for state management`;
  }
  if (label.includes('Cubit')) {
    return `Cubit pattern (simplified BLoC) for state management`;
  }
  if (label.includes('State classes')) {
    return `Immutable state definitions, likely using Freezed`;
  }
  if (label.includes('event classes')) {
    return `Event definitions for BLoC pattern`;
  }
  if (label.includes('Repository')) {
    if (label.includes('interface') || label.includes('Interface')) {
      return `Repository contracts (abstractions) in domain layer`;
    }
    return `Repository pattern for data access abstraction`;
  }
  if (label.includes('Use case') || label.includes('usecase')) {
    return `Use case classes encapsulating business logic`;
  }
  if (label.includes('Domain entities') || label.includes('Entity classes')) {
    return `Core domain entities representing business concepts`;
  }
  if (label.includes('Data models') || label.includes('transfer objects')) {
    return `Data transfer objects for API/persistence layer`;
  }
  if (label.includes('Page widgets') || label.includes('Screen widgets')) {
    return `Screen-level UI components (top-level routes)`;
  }
  if (label.includes('Custom widgets') || label.includes('Widget classes')) {
    return `Reusable UI components`;
  }
  if (label.includes('Provider classes') || label.includes('Notifier classes')) {
    return `State management using Provider/Riverpod pattern`;
  }
  if (label.includes('Service classes')) {
    return `Service layer handling business operations`;
  }
  if (label.includes('Controller classes')) {
    return `Controllers managing application logic`;
  }
  if (label.includes('Data sources')) {
    return `Data sources for remote/local data access`;
  }
  if (label.includes('Test files') || label.includes('Unit tests')) {
    return `Test suite for code verification`;
  }
  if (label.includes('Custom hooks')) {
    return `Reusable React hooks for shared logic`;
  }
  if (label.includes('Redux slices')) {
    return `Redux Toolkit slices for state management`;
  }
  if (label.includes('API routes')) {
    return `API endpoint definitions`;
  }
  if (label.includes('Middleware')) {
    return `Middleware for request/response processing`;
  }
  if (label.includes('GraphQL resolvers')) {
    return `GraphQL resolver functions`;
  }
  if (label.includes('Utility functions') || label.includes('Helper functions')) {
    return `Shared utility/helper functions`;
  }
  if (label.includes('CLI commands')) {
    return `Command-line interface implementations`;
  }

  // Fallback to a generic but still informative description
  if (fileCount > 1) {
    return `Consistent pattern across ${fileCount} files`;
  }
  return `Related code units with similar structure`;
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

    // Generate meaningful description based on the label
    const description = generatePatternDescription(cluster, files.length);

    // High coherence = strong pattern
    if (coherence >= 0.85 && cluster.label) {
      patterns.push({
        name: cluster.label,
        description,
        confidence: 'observed',
        evidence: [
          `Semantic similarity: ${(coherence * 100).toFixed(0)}%`,
          `Spread across ${files.length} file${files.length > 1 ? 's' : ''}`,
        ],
        files: files.slice(0, 5),
        similarity: coherence,
      });
    } else if (coherence >= 0.7) {
      patterns.push({
        name: cluster.label || `Pattern #${cluster.id}`,
        description,
        confidence: 'inferred',
        evidence: [
          `Semantic similarity: ${(coherence * 100).toFixed(0)}%`,
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

  // Group patterns by architectural layer for better presentation
  const stateManagementPatterns = result.patterns.filter(p =>
    p.name.includes('BLoC') || p.name.includes('Cubit') ||
    p.name.includes('State') || p.name.includes('event') ||
    p.name.includes('Provider') || p.name.includes('Notifier') ||
    p.name.includes('Redux') || p.name.includes('Store')
  );

  const dataLayerPatterns = result.patterns.filter(p =>
    p.name.includes('Repository') || p.name.includes('Data source') ||
    p.name.includes('Service') || p.name.includes('Use case') ||
    p.name.includes('Entity') || p.name.includes('Model') ||
    p.name.includes('DTO') || p.name.includes('transfer')
  );

  const uiPatterns = result.patterns.filter(p =>
    p.name.includes('Page') || p.name.includes('Screen') ||
    p.name.includes('Widget') || p.name.includes('View') ||
    p.name.includes('Component') || p.name.includes('hook')
  );

  const otherPatterns = result.patterns.filter(p =>
    !stateManagementPatterns.includes(p) &&
    !dataLayerPatterns.includes(p) &&
    !uiPatterns.includes(p)
  );

  // Present grouped patterns
  if (stateManagementPatterns.length > 0) {
    const parts = stateManagementPatterns.map(p => p.name).join(', ');
    summary.push(`State management: ${parts}`);
  }

  if (dataLayerPatterns.length > 0) {
    const parts = dataLayerPatterns.map(p => p.name).join(', ');
    summary.push(`Data layer: ${parts}`);
  }

  if (uiPatterns.length > 0) {
    const parts = uiPatterns.map(p => p.name).join(', ');
    summary.push(`UI layer: ${parts}`);
  }

  // Show remaining patterns individually
  for (const p of otherPatterns.filter(p => p.confidence === 'observed')) {
    summary.push(`${p.name}: ${p.description}`);
  }

  // Cross-file patterns (only if significant)
  const significantCrossFile = result.crossFilePatterns.filter(
    p => p.files.length >= 3 || (p.similarity && p.similarity >= 0.95)
  );
  for (const p of significantCrossFile.slice(0, 2)) {
    summary.push(`Cross-file: ${p.name} (${p.files.length} files)`);
  }

  // Anomalies only if significant
  if (result.anomalies.length > 5) {
    summary.push(`Note: ${result.anomalies.length} unique code units don't follow common patterns`);
  }

  return summary;
}
