import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import type { FileEntry } from '../types/schema.js';

/**
 * File index entry that maps keywords/identifiers to their file locations
 */
export interface FileIndexEntry {
  files: string[];  // file paths with optional line numbers
}

/**
 * Compact file index structure for .ctx/index.yaml
 */
export interface FileIndex {
  generated_at: string;
  ctx_version: string;
  domains: Record<string, string[]>;  // domain/feature -> file list
  index: Record<string, string[]>;    // keyword -> ["file.ts:line", ...]
  summary: {
    total_files: number;
    total_keywords: number;
    domains_count: number;
  };
}

/**
 * Extracted identifier from source code
 */
interface Identifier {
  name: string;
  type: 'class' | 'function' | 'constant' | 'interface' | 'type' | 'enum' | 'bloc' | 'widget' | 'page' | 'usecase';
  file: string;
  line: number;
}

/**
 * Extract class names from source content
 */
function extractClasses(content: string, file: string): Identifier[] {
  const identifiers: Identifier[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // TypeScript/JavaScript classes
    const tsClassMatch = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (tsClassMatch) {
      identifiers.push({ name: tsClassMatch[1], type: 'class', file, line: i + 1 });
    }

    // Dart classes
    const dartClassMatch = trimmed.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (dartClassMatch) {
      const name = dartClassMatch[1];
      // Detect BLoC/Cubit/Widget/Page patterns
      if (name.endsWith('Bloc')) {
        identifiers.push({ name, type: 'bloc', file, line: i + 1 });
      } else if (name.endsWith('Cubit')) {
        identifiers.push({ name, type: 'bloc', file, line: i + 1 });
      } else if (name.endsWith('Widget')) {
        identifiers.push({ name, type: 'widget', file, line: i + 1 });
      } else if (name.endsWith('Page') || name.endsWith('Screen')) {
        identifiers.push({ name, type: 'page', file, line: i + 1 });
      } else if (name.endsWith('UseCase') || name.endsWith('Usecase')) {
        identifiers.push({ name, type: 'usecase', file, line: i + 1 });
      } else {
        identifiers.push({ name, type: 'class', file, line: i + 1 });
      }
    }

    // Dart mixin
    const mixinMatch = trimmed.match(/^mixin\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (mixinMatch) {
      identifiers.push({ name: mixinMatch[1], type: 'class', file, line: i + 1 });
    }

    // Dart extension
    const extensionMatch = trimmed.match(/^extension\s+([A-Za-z_][A-Za-z0-9_]*)\s+on/);
    if (extensionMatch) {
      identifiers.push({ name: extensionMatch[1], type: 'class', file, line: i + 1 });
    }
  }

  return identifiers;
}

/**
 * Extract function names from source content
 */
function extractFunctions(content: string, file: string): Identifier[] {
  const identifiers: Identifier[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // TypeScript/JavaScript function declarations
    const funcMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (funcMatch) {
      identifiers.push({ name: funcMatch[1], type: 'function', file, line: i + 1 });
    }

    // Arrow functions assigned to const/let (exported or not)
    const arrowMatch = trimmed.match(/^(?:export\s+)?(?:const|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\(/);
    if (arrowMatch) {
      identifiers.push({ name: arrowMatch[1], type: 'function', file, line: i + 1 });
    }

    // Dart top-level functions
    const dartFuncMatch = trimmed.match(/^(?:Future<[^>]+>|void|String|int|bool|double|dynamic|List<[^>]+>|Map<[^>]+>|[A-Z][A-Za-z0-9_]*)\s+([a-z_][A-Za-z0-9_]*)\s*\(/);
    if (dartFuncMatch && !trimmed.includes('class ')) {
      identifiers.push({ name: dartFuncMatch[1], type: 'function', file, line: i + 1 });
    }
  }

  return identifiers;
}

/**
 * Extract interfaces and type definitions
 */
function extractTypes(content: string, file: string): Identifier[] {
  const identifiers: Identifier[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // TypeScript interfaces
    const interfaceMatch = trimmed.match(/^(?:export\s+)?interface\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (interfaceMatch) {
      identifiers.push({ name: interfaceMatch[1], type: 'interface', file, line: i + 1 });
    }

    // TypeScript type aliases
    const typeMatch = trimmed.match(/^(?:export\s+)?type\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=/);
    if (typeMatch) {
      identifiers.push({ name: typeMatch[1], type: 'type', file, line: i + 1 });
    }

    // Dart/TypeScript enums
    const enumMatch = trimmed.match(/^(?:export\s+)?enum\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (enumMatch) {
      identifiers.push({ name: enumMatch[1], type: 'enum', file, line: i + 1 });
    }
  }

  return identifiers;
}

/**
 * Extract important constants (UPPER_CASE or exported const)
 */
function extractConstants(content: string, file: string): Identifier[] {
  const identifiers: Identifier[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Exported constants or UPPER_CASE constants
    const constMatch = trimmed.match(/^(?:export\s+)?const\s+([A-Z_][A-Z0-9_]*)\s*=/);
    if (constMatch) {
      identifiers.push({ name: constMatch[1], type: 'constant', file, line: i + 1 });
    }

    // Dart final/const with UPPER_CASE
    const dartConstMatch = trimmed.match(/^(?:final|const)\s+(?:[A-Za-z_][A-Za-z0-9_<>]*\s+)?([A-Z_][A-Z0-9_]*)\s*=/);
    if (dartConstMatch) {
      identifiers.push({ name: dartConstMatch[1], type: 'constant', file, line: i + 1 });
    }
  }

  return identifiers;
}

/**
 * Convert camelCase/PascalCase to space-separated words
 * e.g., "createNiyet" -> "create niyet", "DatePickerWidget" -> "date picker widget"
 */
function toKeywords(name: string): string[] {
  const keywords: string[] = [];

  // Split by camelCase/PascalCase boundaries
  const words = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(w => w.length > 1);

  // Add individual words
  keywords.push(...words);

  // Add common combinations (pairs)
  for (let i = 0; i < words.length - 1; i++) {
    keywords.push(`${words[i]} ${words[i + 1]}`);
  }

  // Add full phrase if more than one word
  if (words.length > 1) {
    keywords.push(words.join(' '));
  }

  return keywords;
}

/**
 * Group files by domain/feature based on directory structure
 */
function groupByDomain(files: FileEntry[]): Record<string, string[]> {
  const domains: Record<string, string[]> = {};

  for (const file of files) {
    const parts = file.relativePath.split(path.sep);

    // Look for common domain indicators
    let domain = 'root';

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i].toLowerCase();

      // Common feature/domain folder names
      if (['features', 'modules', 'domains', 'packages', 'apps', 'lib'].includes(part)) {
        if (i + 1 < parts.length - 1) {
          domain = parts[i + 1];
          break;
        }
      }

      // Direct feature folders (e.g., src/auth, src/users)
      if (['src', 'app', 'lib'].includes(part) && i + 1 < parts.length - 1) {
        const nextPart = parts[i + 1];
        // Skip common non-feature folders
        if (!['components', 'utils', 'helpers', 'shared', 'common', 'core', 'types', 'models'].includes(nextPart.toLowerCase())) {
          domain = nextPart;
          break;
        }
      }
    }

    if (!domains[domain]) {
      domains[domain] = [];
    }
    domains[domain].push(file.relativePath);
  }

  return domains;
}

/**
 * Build a compact keyword-to-file index from source files
 */
export function buildFileIndex(files: FileEntry[]): FileIndex {
  const index: Record<string, Set<string>> = {};

  for (const file of files) {
    try {
      const content = fs.readFileSync(file.path, 'utf-8');

      // Extract all identifiers
      const identifiers = [
        ...extractClasses(content, file.relativePath),
        ...extractFunctions(content, file.relativePath),
        ...extractTypes(content, file.relativePath),
        ...extractConstants(content, file.relativePath),
      ];

      // Add to index
      for (const id of identifiers) {
        const keywords = toKeywords(id.name);
        const location = `${id.file}:${id.line}`;

        for (const keyword of keywords) {
          if (!index[keyword]) {
            index[keyword] = new Set();
          }
          index[keyword].add(location);
        }

        // Also index by identifier type for common patterns
        const typeKeyword = `${id.type}: ${id.name.toLowerCase()}`;
        if (!index[typeKeyword]) {
          index[typeKeyword] = new Set();
        }
        index[typeKeyword].add(location);
      }

      // Index file itself by its name keywords
      const fileName = path.basename(file.relativePath, file.extension);
      const fileKeywords = toKeywords(fileName);
      for (const keyword of fileKeywords) {
        if (!index[keyword]) {
          index[keyword] = new Set();
        }
        index[keyword].add(file.relativePath);
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Convert Sets to arrays and sort
  const finalIndex: Record<string, string[]> = {};
  for (const [keyword, locations] of Object.entries(index)) {
    // Only include keywords that appear in multiple places or are specific enough
    if (keyword.includes(':') || locations.size <= 5) {
      finalIndex[keyword] = Array.from(locations).sort();
    }
  }

  // Group files by domain
  const domains = groupByDomain(files);

  return {
    generated_at: new Date().toISOString(),
    ctx_version: '0.1.0',
    domains,
    index: finalIndex,
    summary: {
      total_files: files.length,
      total_keywords: Object.keys(finalIndex).length,
      domains_count: Object.keys(domains).length,
    },
  };
}

/**
 * Save the file index to .ctx/index.yaml
 */
export function saveFileIndex(ctxPath: string, index: FileIndex): void {
  const indexPath = path.join(ctxPath, 'index.yaml');

  // Custom YAML formatting for readability
  const yamlContent = YAML.stringify(index, {
    lineWidth: 120,
    defaultKeyType: 'PLAIN',
    defaultStringType: 'QUOTE_DOUBLE',
  });

  fs.writeFileSync(indexPath, yamlContent);
}

/**
 * Load the file index from .ctx/index.yaml
 */
export function loadFileIndex(ctxPath: string): FileIndex | null {
  const indexPath = path.join(ctxPath, 'index.yaml');

  try {
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, 'utf-8');
      return YAML.parse(content) as FileIndex;
    }
  } catch {
    // Ignore load errors
  }

  return null;
}

/**
 * Search the file index for matching files
 */
export function searchIndex(index: FileIndex, query: string): string[] {
  const normalizedQuery = query.toLowerCase().trim();
  const results = new Set<string>();

  // Direct keyword match
  if (index.index[normalizedQuery]) {
    for (const location of index.index[normalizedQuery]) {
      results.add(location);
    }
  }

  // Partial match on keywords
  for (const [keyword, locations] of Object.entries(index.index)) {
    if (keyword.includes(normalizedQuery) || normalizedQuery.includes(keyword)) {
      for (const location of locations) {
        results.add(location);
      }
    }
  }

  return Array.from(results).slice(0, 20); // Limit results
}
