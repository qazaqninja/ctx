import type { EmbeddedChunk } from './embeddings.js';

export interface SimilarityResult {
  chunk: EmbeddedChunk;
  similarity: number;
}

export interface Cluster {
  id: number;
  centroid: number[];
  chunks: EmbeddedChunk[];
  label?: string;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

function vectorMean(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];

  const dims = vectors[0].length;
  const mean = new Array(dims).fill(0);

  for (const vec of vectors) {
    for (let i = 0; i < dims; i++) {
      mean[i] += vec[i];
    }
  }

  for (let i = 0; i < dims; i++) {
    mean[i] /= vectors.length;
  }

  return mean;
}

export function findSimilar(
  query: number[],
  chunks: EmbeddedChunk[],
  k: number
): SimilarityResult[] {
  const results: SimilarityResult[] = chunks.map(chunk => ({
    chunk,
    similarity: cosineSimilarity(query, chunk.embedding),
  }));

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, k);
}

export function findMostSimilarPairs(
  chunks: EmbeddedChunk[],
  threshold: number = 0.85
): Array<{ a: EmbeddedChunk; b: EmbeddedChunk; similarity: number }> {
  const pairs: Array<{ a: EmbeddedChunk; b: EmbeddedChunk; similarity: number }> = [];

  for (let i = 0; i < chunks.length; i++) {
    for (let j = i + 1; j < chunks.length; j++) {
      // Skip chunks from the same file
      if (chunks[i].file === chunks[j].file) continue;

      const sim = cosineSimilarity(chunks[i].embedding, chunks[j].embedding);
      if (sim >= threshold) {
        pairs.push({ a: chunks[i], b: chunks[j], similarity: sim });
      }
    }
  }

  pairs.sort((a, b) => b.similarity - a.similarity);
  return pairs;
}

// Simple k-means clustering
export function clusterChunks(chunks: EmbeddedChunk[], k: number): Cluster[] {
  if (chunks.length === 0) return [];
  if (chunks.length <= k) {
    // Each chunk is its own cluster
    return chunks.map((chunk, i) => ({
      id: i,
      centroid: chunk.embedding,
      chunks: [chunk],
    }));
  }

  const dims = chunks[0].embedding.length;

  // Initialize centroids randomly from existing chunks
  const shuffled = [...chunks].sort(() => Math.random() - 0.5);
  let centroids = shuffled.slice(0, k).map(c => [...c.embedding]);

  const maxIterations = 50;
  let assignments = new Array(chunks.length).fill(-1);

  for (let iter = 0; iter < maxIterations; iter++) {
    const newAssignments = new Array(chunks.length).fill(-1);

    // Assign each chunk to nearest centroid
    for (let i = 0; i < chunks.length; i++) {
      let bestCluster = 0;
      let bestSim = -Infinity;

      for (let c = 0; c < k; c++) {
        const sim = cosineSimilarity(chunks[i].embedding, centroids[c]);
        if (sim > bestSim) {
          bestSim = sim;
          bestCluster = c;
        }
      }

      newAssignments[i] = bestCluster;
    }

    // Check convergence
    const converged = assignments.every((a, i) => a === newAssignments[i]);
    assignments = newAssignments;

    if (converged) break;

    // Recompute centroids
    const clusterVectors: number[][][] = Array.from({ length: k }, () => []);
    for (let i = 0; i < chunks.length; i++) {
      clusterVectors[assignments[i]].push(chunks[i].embedding);
    }

    centroids = clusterVectors.map((vecs, c) =>
      vecs.length > 0 ? vectorMean(vecs) : centroids[c]
    );
  }

  // Build clusters
  const clusters: Cluster[] = [];
  for (let c = 0; c < k; c++) {
    const clusterChunks = chunks.filter((_, i) => assignments[i] === c);
    if (clusterChunks.length > 0) {
      clusters.push({
        id: c,
        centroid: centroids[c],
        chunks: clusterChunks,
      });
    }
  }

  return clusters;
}

// Automatically determine number of clusters using elbow method (simplified)
export function autoCluster(chunks: EmbeddedChunk[], maxK: number = 10): Cluster[] {
  if (chunks.length <= 3) {
    return clusterChunks(chunks, 1);
  }

  // Use sqrt(n/2) as a heuristic for k
  const k = Math.min(Math.max(2, Math.floor(Math.sqrt(chunks.length / 2))), maxK);
  return clusterChunks(chunks, k);
}

// Pattern matchers for specific file types - returns { label, detail } or null
interface PatternMatch {
  label: string;
  detail?: string;
}

interface FilePatternRule {
  // Match by file suffix (e.g., '_bloc.dart')
  fileSuffix?: string;
  // Match by directory path pattern
  pathPattern?: RegExp;
  // Match by class/function name suffix
  nameSuffix?: string;
  // The label to use
  label: string;
  // Optional detail about the pattern (e.g., "using Freezed pattern")
  detail?: string;
}

const FILE_PATTERN_RULES: FilePatternRule[] = [
  // Flutter/Dart BLoC patterns
  { fileSuffix: '_bloc.dart', label: 'BLoC classes', detail: 'event-driven state management' },
  { fileSuffix: '_cubit.dart', label: 'Cubit classes', detail: 'simplified BLoC pattern' },
  { fileSuffix: '_state.dart', label: 'State classes', detail: 'using Freezed pattern' },
  { fileSuffix: '_event.dart', label: 'BLoC event classes', detail: 'event-driven architecture' },

  // Flutter/Dart data layer patterns
  { fileSuffix: '_model.dart', label: 'Data models' },
  { fileSuffix: '_entity.dart', label: 'Domain entities' },
  { fileSuffix: '_dto.dart', label: 'Data transfer objects' },
  { fileSuffix: '_repository.dart', label: 'Repository classes', detail: 'data access layer' },
  { fileSuffix: '_datasource.dart', label: 'Data sources', detail: 'remote/local data access' },
  { fileSuffix: '_service.dart', label: 'Service classes' },
  { fileSuffix: '_usecase.dart', label: 'Use case classes', detail: 'clean architecture' },

  // Flutter/Dart UI patterns
  { fileSuffix: '_page.dart', label: 'Page widgets', detail: 'screen-level components' },
  { fileSuffix: '_screen.dart', label: 'Screen widgets', detail: 'screen-level components' },
  { fileSuffix: '_widget.dart', label: 'Custom widgets', detail: 'reusable UI components' },
  { fileSuffix: '_view.dart', label: 'View widgets' },
  { fileSuffix: '_dialog.dart', label: 'Dialog widgets' },
  { fileSuffix: '_card.dart', label: 'Card widgets' },
  { fileSuffix: '_button.dart', label: 'Button widgets' },
  { fileSuffix: '_form.dart', label: 'Form widgets' },

  // Flutter/Dart provider patterns
  { fileSuffix: '_provider.dart', label: 'Provider classes', detail: 'state management' },
  { fileSuffix: '_notifier.dart', label: 'Notifier classes', detail: 'Riverpod/ChangeNotifier pattern' },
  { fileSuffix: '_controller.dart', label: 'Controller classes' },

  // Path-based patterns for clean architecture
  { pathPattern: /\/domain\/entities\//, label: 'Domain entities', detail: 'clean architecture core' },
  { pathPattern: /\/domain\/repositories\//, label: 'Repository interfaces', detail: 'domain contracts' },
  { pathPattern: /\/domain\/usecases\//, label: 'Use cases', detail: 'business logic' },
  { pathPattern: /\/data\/models\//, label: 'Data transfer objects', detail: 'API/DB models' },
  { pathPattern: /\/data\/repositories\//, label: 'Repository implementations', detail: 'data layer' },
  { pathPattern: /\/data\/datasources\//, label: 'Data sources', detail: 'remote/local access' },
  { pathPattern: /\/presentation\/bloc\//, label: 'BLoC classes', detail: 'presentation layer' },
  { pathPattern: /\/presentation\/pages\//, label: 'Page widgets', detail: 'screen-level UI' },
  { pathPattern: /\/presentation\/widgets\//, label: 'Custom widgets', detail: 'reusable components' },
  { pathPattern: /\/features\/[^/]+\/bloc\//, label: 'Feature BLoCs', detail: 'feature-scoped state' },
  { pathPattern: /\/features\/[^/]+\/pages\//, label: 'Feature pages', detail: 'feature UI' },

  // TypeScript/JavaScript patterns
  { fileSuffix: '.service.ts', label: 'Service classes' },
  { fileSuffix: '.repository.ts', label: 'Repository classes' },
  { fileSuffix: '.controller.ts', label: 'Controller classes' },
  { fileSuffix: '.middleware.ts', label: 'Middleware' },
  { fileSuffix: '.handler.ts', label: 'Handler classes' },
  { fileSuffix: '.resolver.ts', label: 'GraphQL resolvers' },
  { fileSuffix: '.guard.ts', label: 'Guards', detail: 'authentication/authorization' },
  { fileSuffix: '.pipe.ts', label: 'Pipes', detail: 'data transformation' },
  { fileSuffix: '.interceptor.ts', label: 'Interceptors' },
  { fileSuffix: '.decorator.ts', label: 'Decorators' },
  { fileSuffix: '.module.ts', label: 'Module definitions' },
  { fileSuffix: '.dto.ts', label: 'Data transfer objects' },
  { fileSuffix: '.entity.ts', label: 'Entity classes', detail: 'ORM entities' },

  // React patterns
  { fileSuffix: '.hook.ts', label: 'Custom hooks' },
  { fileSuffix: '.hook.tsx', label: 'Custom hooks' },
  { fileSuffix: '.context.tsx', label: 'React contexts' },
  { fileSuffix: '.provider.tsx', label: 'Context providers' },
  { fileSuffix: '.store.ts', label: 'State stores' },
  { fileSuffix: '.slice.ts', label: 'Redux slices', detail: 'Redux Toolkit pattern' },
  { fileSuffix: '.reducer.ts', label: 'Reducers' },
  { fileSuffix: '.action.ts', label: 'Action creators' },
  { fileSuffix: '.selector.ts', label: 'State selectors' },

  // Test patterns
  { fileSuffix: '.test.ts', label: 'Unit tests' },
  { fileSuffix: '.test.tsx', label: 'Component tests' },
  { fileSuffix: '.spec.ts', label: 'Test specifications' },
  { fileSuffix: '_test.dart', label: 'Unit tests' },
  { fileSuffix: '_test.go', label: 'Unit tests' },
  { pathPattern: /__tests__\//, label: 'Test files' },
  { pathPattern: /\/test\//, label: 'Test files' },
  { pathPattern: /\/tests\//, label: 'Test files' },

  // Go patterns
  { fileSuffix: '_handler.go', label: 'HTTP handlers' },
  { fileSuffix: '_service.go', label: 'Service implementations' },
  { fileSuffix: '_repository.go', label: 'Repository implementations' },
  { fileSuffix: '_middleware.go', label: 'Middleware' },

  // Python patterns
  { fileSuffix: '_service.py', label: 'Service classes' },
  { fileSuffix: '_repository.py', label: 'Repository classes' },
  { fileSuffix: '_model.py', label: 'Data models' },
  { fileSuffix: '_schema.py', label: 'Pydantic schemas' },
  { fileSuffix: '_router.py', label: 'API routers', detail: 'FastAPI routes' },
];

function matchFilePattern(file: string): PatternMatch | null {
  for (const rule of FILE_PATTERN_RULES) {
    if (rule.fileSuffix && file.endsWith(rule.fileSuffix)) {
      return { label: rule.label, detail: rule.detail };
    }
    if (rule.pathPattern && rule.pathPattern.test(file)) {
      return { label: rule.label, detail: rule.detail };
    }
  }
  return null;
}

// Label clusters based on common patterns in chunk names and file paths
export function labelClusters(clusters: Cluster[]): Cluster[] {
  return clusters.map(cluster => {
    const names = cluster.chunks.map(c => c.name);
    const files = cluster.chunks.map(c => c.file);
    const types = cluster.chunks.map(c => c.type);
    const count = cluster.chunks.length;

    // STEP 1: Try file pattern rules first (most specific)
    const patternCounts: Map<string, { count: number; detail?: string }> = new Map();
    for (const file of files) {
      const match = matchFilePattern(file);
      if (match) {
        const existing = patternCounts.get(match.label);
        if (existing) {
          existing.count++;
        } else {
          patternCounts.set(match.label, { count: 1, detail: match.detail });
        }
      }
    }

    // Find dominant file pattern (if > 50% of files match)
    let label: string | undefined;
    let labelDetail: string | undefined;

    const sortedPatterns = [...patternCounts.entries()].sort((a, b) => b[1].count - a[1].count);
    if (sortedPatterns.length > 0) {
      const [bestPattern, { count: patternCount, detail }] = sortedPatterns[0];
      if (patternCount >= count * 0.5) {
        label = `${patternCount} ${bestPattern}`;
        labelDetail = detail;
      }
    }

    // STEP 2: Try name-based suffix patterns (Service, Repository, etc.)
    if (!label) {
      const suffixes: Record<string, number> = {};
      for (const name of names) {
        const matches = name.match(/(Service|Repository|Controller|Handler|Middleware|Utils?|Helper|Manager|Factory|Provider|Validator|Parser|Builder|Resolver|Bloc|Cubit|State|Event|Model|Entity|Widget|Page|Screen|View)$/i);
        if (matches) {
          const suffix = matches[1].toLowerCase();
          suffixes[suffix] = (suffixes[suffix] || 0) + 1;
        }
      }

      let maxCount = 0;
      let bestSuffix = '';
      for (const [suffix, suffixCount] of Object.entries(suffixes)) {
        if (suffixCount > maxCount && suffixCount >= count * 0.3) {
          maxCount = suffixCount;
          bestSuffix = suffix;
        }
      }

      if (bestSuffix) {
        // Map suffix to proper label
        const suffixLabels: Record<string, string> = {
          service: 'Service classes',
          repository: 'Repository classes',
          controller: 'Controller classes',
          handler: 'Handler classes',
          middleware: 'Middleware',
          util: 'Utility functions',
          utils: 'Utility functions',
          helper: 'Helper functions',
          manager: 'Manager classes',
          factory: 'Factory classes',
          provider: 'Provider classes',
          validator: 'Validators',
          parser: 'Parsers',
          builder: 'Builder classes',
          resolver: 'Resolver classes',
          bloc: 'BLoC classes',
          cubit: 'Cubit classes',
          state: 'State classes',
          event: 'Event classes',
          model: 'Data models',
          entity: 'Entity classes',
          widget: 'Widget classes',
          page: 'Page widgets',
          screen: 'Screen widgets',
          view: 'View classes',
        };
        label = `${maxCount} ${suffixLabels[bestSuffix] || bestSuffix + ' pattern'}`;
      }
    }

    // STEP 3: Try to identify by directory patterns
    if (!label) {
      const dirPatterns: Record<string, number> = {};
      for (const file of files) {
        const parts = file.split('/');
        for (const part of parts) {
          const partLower = part.toLowerCase();
          // Common directory names
          if (['test', 'tests', '__tests__', 'spec', 'fixtures'].includes(partLower)) {
            dirPatterns['Test files'] = (dirPatterns['Test files'] || 0) + 1;
          } else if (['cli', 'commands', 'cmd'].includes(partLower)) {
            dirPatterns['CLI commands'] = (dirPatterns['CLI commands'] || 0) + 1;
          } else if (['routes', 'api', 'endpoints'].includes(partLower)) {
            dirPatterns['API routes'] = (dirPatterns['API routes'] || 0) + 1;
          } else if (['models', 'entities', 'domain'].includes(partLower)) {
            dirPatterns['Domain models'] = (dirPatterns['Domain models'] || 0) + 1;
          } else if (['utils', 'helpers', 'shared', 'common'].includes(partLower)) {
            dirPatterns['Utility functions'] = (dirPatterns['Utility functions'] || 0) + 1;
          } else if (['components', 'widgets', 'ui'].includes(partLower)) {
            dirPatterns['UI components'] = (dirPatterns['UI components'] || 0) + 1;
          } else if (['hooks'].includes(partLower)) {
            dirPatterns['Custom hooks'] = (dirPatterns['Custom hooks'] || 0) + 1;
          } else if (['stores', 'state'].includes(partLower)) {
            dirPatterns['State management'] = (dirPatterns['State management'] || 0) + 1;
          } else if (['bloc', 'blocs'].includes(partLower)) {
            dirPatterns['BLoC classes'] = (dirPatterns['BLoC classes'] || 0) + 1;
          } else if (['pages', 'screens', 'views'].includes(partLower)) {
            dirPatterns['Page/Screen widgets'] = (dirPatterns['Page/Screen widgets'] || 0) + 1;
          }
        }
      }

      const bestDir = Object.entries(dirPatterns).sort((a, b) => b[1] - a[1])[0];
      if (bestDir && bestDir[1] >= count * 0.4) {
        label = `${bestDir[1]} ${bestDir[0]}`;
      }
    }

    // STEP 4: Try function naming patterns
    if (!label) {
      const prefixes: Record<string, number> = {};
      for (const name of names) {
        const match = name.match(/^(get|set|create|update|delete|find|fetch|handle|process|validate|parse|build|render|on|use)/i);
        if (match) {
          prefixes[match[1].toLowerCase()] = (prefixes[match[1].toLowerCase()] || 0) + 1;
        }
      }

      const bestPrefix = Object.entries(prefixes).sort((a, b) => b[1] - a[1])[0];
      if (bestPrefix && bestPrefix[1] >= count * 0.4) {
        const prefixLabels: Record<string, string> = {
          get: 'Getter methods',
          set: 'Setter methods',
          create: 'Creator functions',
          update: 'Update handlers',
          delete: 'Delete handlers',
          find: 'Query methods',
          fetch: 'Data fetching functions',
          handle: 'Event handlers',
          process: 'Processing functions',
          validate: 'Validation functions',
          parse: 'Parser functions',
          build: 'Builder functions',
          render: 'Render methods',
          on: 'Event callbacks',
          use: 'Custom hooks',
        };
        label = `${bestPrefix[1]} ${prefixLabels[bestPrefix[0]] || bestPrefix[0] + '* methods'}`;
      }
    }

    // STEP 5: Final fallback - describe by type with better language
    if (!label) {
      const typeCount: Record<string, number> = {};
      for (const type of types) {
        typeCount[type] = (typeCount[type] || 0) + 1;
      }
      const dominantType = Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0];
      if (dominantType) {
        const [typeName, typeOccurrences] = dominantType;
        const typeLabels: Record<string, string> = {
          class: 'classes',
          function: 'functions',
          method: 'methods',
          interface: 'interfaces',
          type: 'type definitions',
          enum: 'enums',
          const: 'constants',
          variable: 'variables',
        };
        const plural = typeLabels[typeName] || `${typeName}s`;
        label = `${typeOccurrences} related ${plural}`;
      }
    }

    // Build final label with detail if available
    const finalLabel = labelDetail ? `${label} (${labelDetail})` : label;

    return { ...cluster, label: finalLabel };
  });
}

// Calculate average intra-cluster similarity
export function clusterCoherence(cluster: Cluster): number {
  if (cluster.chunks.length <= 1) return 1;

  let totalSim = 0;
  let count = 0;

  for (let i = 0; i < cluster.chunks.length; i++) {
    for (let j = i + 1; j < cluster.chunks.length; j++) {
      totalSim += cosineSimilarity(
        cluster.chunks[i].embedding,
        cluster.chunks[j].embedding
      );
      count++;
    }
  }

  return count > 0 ? totalSim / count : 1;
}
