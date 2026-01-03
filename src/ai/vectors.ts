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

// Label clusters based on common patterns in chunk names
export function labelClusters(clusters: Cluster[]): Cluster[] {
  return clusters.map(cluster => {
    const names = cluster.chunks.map(c => c.name);
    const types = cluster.chunks.map(c => c.type);

    // Find common suffix patterns
    const suffixes: Record<string, number> = {};
    for (const name of names) {
      const matches = name.match(/(Service|Repository|Controller|Handler|Middleware|Utils?|Helper|Manager|Factory|Provider)$/i);
      if (matches) {
        const suffix = matches[1].toLowerCase();
        suffixes[suffix] = (suffixes[suffix] || 0) + 1;
      }
    }

    // Find most common suffix
    let label: string | undefined;
    let maxCount = 0;
    for (const [suffix, count] of Object.entries(suffixes)) {
      if (count > maxCount && count >= cluster.chunks.length * 0.3) {
        maxCount = count;
        label = suffix + ' pattern';
      }
    }

    // Fallback to type-based label
    if (!label) {
      const typeCount: Record<string, number> = {};
      for (const type of types) {
        typeCount[type] = (typeCount[type] || 0) + 1;
      }
      const dominantType = Object.entries(typeCount)
        .sort((a, b) => b[1] - a[1])[0];
      if (dominantType && dominantType[1] >= cluster.chunks.length * 0.5) {
        label = `${dominantType[0]} cluster`;
      }
    }

    return { ...cluster, label };
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
