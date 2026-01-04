import fs from 'fs';
import crypto from 'crypto';
import type { FileEntry } from '../types/schema.js';

export type ChunkType = 'function' | 'class' | 'method' | 'module' | 'block';

export interface CodeChunk {
  id: string;
  file: string;
  type: ChunkType;
  name: string;
  content: string;
  startLine: number;
  endLine: number;
}

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

interface ChunkMatch {
  type: ChunkType;
  name: string;
  content: string;
  startLine: number;
  endLine: number;
}

function extractChunks(content: string, file: string): ChunkMatch[] {
  const lines = content.split('\n');
  const chunks: ChunkMatch[] = [];

  // Track brace depth for block extraction
  let currentChunk: Partial<ChunkMatch> | null = null;
  let braceDepth = 0;
  let chunkStartLine = 0;
  let chunkLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments when looking for starts
    if (!currentChunk && (trimmed === '' || trimmed.startsWith('//'))) {
      continue;
    }

    // Detect function/class/method starts
    if (!currentChunk || braceDepth === 0) {
      // Class declaration
      const classMatch = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
      if (classMatch) {
        if (currentChunk && chunkLines.length > 0) {
          chunks.push({
            type: currentChunk.type!,
            name: currentChunk.name!,
            content: chunkLines.join('\n'),
            startLine: chunkStartLine,
            endLine: i - 1,
          });
        }
        currentChunk = { type: 'class', name: classMatch[1] };
        chunkStartLine = i + 1;
        chunkLines = [line];
        braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        continue;
      }

      // Function declaration
      const funcMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
      if (funcMatch) {
        if (currentChunk && chunkLines.length > 0) {
          chunks.push({
            type: currentChunk.type!,
            name: currentChunk.name!,
            content: chunkLines.join('\n'),
            startLine: chunkStartLine,
            endLine: i - 1,
          });
        }
        currentChunk = { type: 'function', name: funcMatch[1] };
        chunkStartLine = i + 1;
        chunkLines = [line];
        braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        continue;
      }

      // Arrow function assigned to const/let
      const arrowMatch = trimmed.match(/^(?:export\s+)?(?:const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\(/);
      if (arrowMatch) {
        if (currentChunk && chunkLines.length > 0) {
          chunks.push({
            type: currentChunk.type!,
            name: currentChunk.name!,
            content: chunkLines.join('\n'),
            startLine: chunkStartLine,
            endLine: i - 1,
          });
        }
        currentChunk = { type: 'function', name: arrowMatch[1] };
        chunkStartLine = i + 1;
        chunkLines = [line];
        braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        continue;
      }

      // Interface/Type (treat as block)
      const interfaceMatch = trimmed.match(/^(?:export\s+)?(?:interface|type)\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
      if (interfaceMatch) {
        if (currentChunk && chunkLines.length > 0) {
          chunks.push({
            type: currentChunk.type!,
            name: currentChunk.name!,
            content: chunkLines.join('\n'),
            startLine: chunkStartLine,
            endLine: i - 1,
          });
        }
        currentChunk = { type: 'block', name: interfaceMatch[1] };
        chunkStartLine = i + 1;
        chunkLines = [line];
        braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        continue;
      }

      // Dart mixin declaration
      const mixinMatch = trimmed.match(/^mixin\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (mixinMatch) {
        if (currentChunk && chunkLines.length > 0) {
          chunks.push({
            type: currentChunk.type!,
            name: currentChunk.name!,
            content: chunkLines.join('\n'),
            startLine: chunkStartLine,
            endLine: i - 1,
          });
        }
        currentChunk = { type: 'class', name: mixinMatch[1] };
        chunkStartLine = i + 1;
        chunkLines = [line];
        braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        continue;
      }

      // Dart extension declaration
      const extensionMatch = trimmed.match(/^extension\s+([A-Za-z_][A-Za-z0-9_]*)\s+on/);
      if (extensionMatch) {
        if (currentChunk && chunkLines.length > 0) {
          chunks.push({
            type: currentChunk.type!,
            name: currentChunk.name!,
            content: chunkLines.join('\n'),
            startLine: chunkStartLine,
            endLine: i - 1,
          });
        }
        currentChunk = { type: 'class', name: extensionMatch[1] };
        chunkStartLine = i + 1;
        chunkLines = [line];
        braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        continue;
      }

      // Dart enum declaration
      const enumMatch = trimmed.match(/^enum\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (enumMatch) {
        if (currentChunk && chunkLines.length > 0) {
          chunks.push({
            type: currentChunk.type!,
            name: currentChunk.name!,
            content: chunkLines.join('\n'),
            startLine: chunkStartLine,
            endLine: i - 1,
          });
        }
        currentChunk = { type: 'block', name: enumMatch[1] };
        chunkStartLine = i + 1;
        chunkLines = [line];
        braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        continue;
      }

      // Dart top-level function (void, Future, etc.)
      const dartFuncMatch = trimmed.match(/^(?:Future<[^>]+>|void|String|int|bool|double|dynamic|List<[^>]+>|Map<[^>]+>|[A-Z][A-Za-z0-9_]*)\s+([a-z_][A-Za-z0-9_]*)\s*\(/);
      if (dartFuncMatch && !currentChunk) {
        currentChunk = { type: 'function', name: dartFuncMatch[1] };
        chunkStartLine = i + 1;
        chunkLines = [line];
        braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        continue;
      }
    }

    // Continue building current chunk
    if (currentChunk) {
      chunkLines.push(line);
      braceDepth += (line.match(/{/g) || []).length;
      braceDepth -= (line.match(/}/g) || []).length;

      // Chunk complete when braces balance
      if (braceDepth <= 0 && chunkLines.length > 1) {
        chunks.push({
          type: currentChunk.type!,
          name: currentChunk.name!,
          content: chunkLines.join('\n'),
          startLine: chunkStartLine,
          endLine: i + 1,
        });
        currentChunk = null;
        chunkLines = [];
        braceDepth = 0;
      }
    }
  }

  // Don't forget the last chunk if file doesn't end with closing brace
  if (currentChunk && chunkLines.length > 0) {
    chunks.push({
      type: currentChunk.type!,
      name: currentChunk.name!,
      content: chunkLines.join('\n'),
      startLine: chunkStartLine,
      endLine: lines.length,
    });
  }

  return chunks;
}

export function chunkFile(file: FileEntry): CodeChunk[] {
  try {
    const content = fs.readFileSync(file.path, 'utf-8');
    const rawChunks = extractChunks(content, file.relativePath);

    return rawChunks
      .filter(chunk => chunk.content.length > 50) // Skip tiny chunks
      .filter(chunk => chunk.content.length < 10000) // Skip huge chunks
      .map(chunk => ({
        id: hashContent(chunk.content),
        file: file.relativePath,
        type: chunk.type,
        name: chunk.name,
        content: chunk.content,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
      }));
  } catch {
    return [];
  }
}

export function chunkFiles(files: FileEntry[]): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const supportedFiles = files.filter(f =>
    ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.dart'].includes(f.extension)
  );

  for (const file of supportedFiles) {
    chunks.push(...chunkFile(file));
  }

  return chunks;
}

export function getChunkStats(chunks: CodeChunk[]): {
  total: number;
  byType: Record<ChunkType, number>;
  avgSize: number;
} {
  const byType: Record<ChunkType, number> = {
    function: 0,
    class: 0,
    method: 0,
    module: 0,
    block: 0,
  };

  let totalSize = 0;

  for (const chunk of chunks) {
    byType[chunk.type]++;
    totalSize += chunk.content.length;
  }

  return {
    total: chunks.length,
    byType,
    avgSize: chunks.length > 0 ? Math.round(totalSize / chunks.length) : 0,
  };
}
