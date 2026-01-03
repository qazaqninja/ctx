import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { embedBatch } from './ollama.js';
import type { CodeChunk } from './chunker.js';

export interface EmbeddedChunk extends CodeChunk {
  embedding: number[];
}

interface EmbeddingCache {
  model: string;
  chunks: Record<string, number[]>; // chunk id -> embedding
  fileHashes: Record<string, string>; // file path -> content hash
}

const BATCH_SIZE = 5;

function hashFile(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  } catch {
    return '';
  }
}

export function loadCache(ctxPath: string): EmbeddingCache | null {
  const cachePath = path.join(ctxPath, 'embeddings.json');
  try {
    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      return data as EmbeddingCache;
    }
  } catch {
    // Ignore cache errors
  }
  return null;
}

export function saveCache(ctxPath: string, cache: EmbeddingCache): void {
  const cachePath = path.join(ctxPath, 'embeddings.json');
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

export interface EmbedProgress {
  total: number;
  done: number;
  current: string;
}

export type ProgressCallback = (progress: EmbedProgress) => void;

export async function embedChunks(
  chunks: CodeChunk[],
  model: string,
  ctxPath: string,
  onProgress?: ProgressCallback
): Promise<EmbeddedChunk[]> {
  const cache = loadCache(ctxPath);
  const embeddedChunks: EmbeddedChunk[] = [];

  // Build file hash map for current state
  const currentFileHashes: Record<string, string> = {};
  const uniqueFiles = new Set(chunks.map(c => c.file));
  for (const file of uniqueFiles) {
    const fullPath = path.join(process.cwd(), file);
    currentFileHashes[file] = hashFile(fullPath);
  }

  // Determine which chunks need embedding
  const chunksToEmbed: CodeChunk[] = [];
  const cachedEmbeddings: Map<string, number[]> = new Map();

  for (const chunk of chunks) {
    const cacheValid =
      cache &&
      cache.model === model &&
      cache.fileHashes[chunk.file] === currentFileHashes[chunk.file] &&
      cache.chunks[chunk.id];

    if (cacheValid) {
      cachedEmbeddings.set(chunk.id, cache.chunks[chunk.id]);
    } else {
      chunksToEmbed.push(chunk);
    }
  }

  // Use cached embeddings
  for (const chunk of chunks) {
    const cached = cachedEmbeddings.get(chunk.id);
    if (cached) {
      embeddedChunks.push({ ...chunk, embedding: cached });
    }
  }

  // Embed new chunks in batches
  const newEmbeddings: Record<string, number[]> = {};

  for (let i = 0; i < chunksToEmbed.length; i += BATCH_SIZE) {
    const batch = chunksToEmbed.slice(i, i + BATCH_SIZE);
    const texts = batch.map(c => c.content);

    if (onProgress) {
      onProgress({
        total: chunksToEmbed.length,
        done: i,
        current: batch[0].name,
      });
    }

    try {
      const embeddings = await embedBatch(model, texts);

      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const embedding = embeddings[j];
        newEmbeddings[chunk.id] = embedding;
        embeddedChunks.push({ ...chunk, embedding });
      }
    } catch (err) {
      console.error(`Embedding batch failed: ${err}`);
      // Continue with other batches
    }
  }

  if (onProgress) {
    onProgress({
      total: chunksToEmbed.length,
      done: chunksToEmbed.length,
      current: 'done',
    });
  }

  // Update cache
  const newCache: EmbeddingCache = {
    model,
    chunks: {
      ...(cache?.model === model ? cache.chunks : {}),
      ...newEmbeddings,
    },
    fileHashes: currentFileHashes,
  };
  saveCache(ctxPath, newCache);

  return embeddedChunks;
}

export function getEmbeddingStats(chunks: EmbeddedChunk[]): {
  total: number;
  dimensions: number;
  byFile: Record<string, number>;
} {
  const byFile: Record<string, number> = {};

  for (const chunk of chunks) {
    byFile[chunk.file] = (byFile[chunk.file] || 0) + 1;
  }

  return {
    total: chunks.length,
    dimensions: chunks[0]?.embedding.length || 0,
    byFile,
  };
}
