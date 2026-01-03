import fs from 'fs';
import path from 'path';
import type { FileEntry, Finding, StructurePattern, Confidence } from '../types/schema.js';
import { getDirectoryStructure } from './filesystem.js';

type NamingStyle = 'kebab-case' | 'snake_case' | 'camelCase' | 'PascalCase' | 'mixed';

function detectCase(name: string): NamingStyle {
  if (name.includes('-')) return 'kebab-case';
  if (name.includes('_')) return 'snake_case';
  if (/^[a-z]/.test(name) && /[A-Z]/.test(name)) return 'camelCase';
  if (/^[A-Z]/.test(name)) return 'PascalCase';
  return 'mixed';
}

function calculateConfidence(consistency: number): Confidence {
  if (consistency >= 0.8) return 'observed';
  if (consistency >= 0.5) return 'inferred';
  return 'uncertain';
}

export function detectNamingConvention(files: FileEntry[]): Finding<NamingStyle> {
  const counts: Record<NamingStyle, number> = {
    'kebab-case': 0,
    'snake_case': 0,
    'camelCase': 0,
    'PascalCase': 0,
    'mixed': 0,
  };

  for (const file of files) {
    const basename = path.basename(file.relativePath, file.extension);
    const style = detectCase(basename);
    counts[style]++;
  }

  const total = files.length;
  let maxStyle: NamingStyle = 'mixed';
  let maxCount = 0;

  for (const [style, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      maxStyle = style as NamingStyle;
    }
  }

  const consistency = total > 0 ? maxCount / total : 0;

  return {
    value: maxStyle,
    confidence: calculateConfidence(consistency),
    evidence: [`${Math.round(consistency * 100)}% of files use ${maxStyle}`],
  };
}

export function detectStructurePattern(files: FileEntry[]): Finding<StructurePattern> {
  const structure = getDirectoryStructure(files);
  const topLevelDirs = new Set<string>();

  for (const file of files) {
    const parts = file.relativePath.split(path.sep);
    if (parts.length > 1) {
      topLevelDirs.add(parts[0]);
      if (parts.length > 2) {
        topLevelDirs.add(parts.slice(0, 2).join(path.sep));
      }
    }
  }

  const hasFeatures = Array.from(topLevelDirs).some(d =>
    d.includes('features') || d.includes('modules') || d.includes('domains')
  );

  const layeredPatterns = ['controllers', 'services', 'repositories', 'models', 'handlers'];
  const hasLayers = layeredPatterns.filter(p =>
    Array.from(topLevelDirs).some(d => d.toLowerCase().includes(p))
  ).length >= 2;

  const avgDepth = files.reduce((sum, f) => sum + f.relativePath.split(path.sep).length, 0) / files.length;

  let pattern: StructurePattern;
  let confidence: Confidence;
  const evidence: string[] = [];

  if (hasFeatures) {
    pattern = 'vertical-features';
    confidence = 'inferred';
    evidence.push('Found features/modules/domains directories');
  } else if (hasLayers) {
    pattern = 'layered';
    confidence = 'inferred';
    evidence.push(`Found layered directories: ${layeredPatterns.filter(p => Array.from(topLevelDirs).some(d => d.toLowerCase().includes(p))).join(', ')}`);
  } else if (avgDepth > 2.5) {
    pattern = 'modular';
    confidence = 'uncertain';
    evidence.push(`Average path depth: ${avgDepth.toFixed(1)}`);
  } else {
    pattern = 'flat';
    confidence = avgDepth < 2 ? 'observed' : 'uncertain';
    evidence.push(`Average path depth: ${avgDepth.toFixed(1)}`);
  }

  return { value: pattern, confidence, evidence };
}

export interface Abstraction {
  name: string;
  pattern: string;
  count: number;
  examples: string[];
}

export function detectAbstractions(files: FileEntry[]): Abstraction[] {
  const patterns = [
    { name: 'service', pattern: /\.service\.[jt]sx?$/ },
    { name: 'repository', pattern: /\.repository\.[jt]sx?$/ },
    { name: 'controller', pattern: /\.controller\.[jt]sx?$/ },
    { name: 'middleware', pattern: /\.middleware\.[jt]sx?$/ },
    { name: 'handler', pattern: /\.handler\.[jt]sx?$/ },
    { name: 'util', pattern: /\.util[s]?\.[jt]sx?$/ },
    { name: 'helper', pattern: /\.helper[s]?\.[jt]sx?$/ },
    { name: 'model', pattern: /\.model\.[jt]sx?$/ },
    { name: 'entity', pattern: /\.entity\.[jt]sx?$/ },
    { name: 'dto', pattern: /\.dto\.[jt]sx?$/ },
  ];

  const results: Abstraction[] = [];

  for (const { name, pattern } of patterns) {
    const matches = files.filter(f => pattern.test(f.relativePath));
    if (matches.length > 0) {
      results.push({
        name,
        pattern: pattern.source,
        count: matches.length,
        examples: matches.slice(0, 3).map(f => f.relativePath),
      });
    }
  }

  return results;
}

export interface LanguageFramework {
  language: Finding<string>;
  framework?: Finding<string>;
}

export function detectLanguageFramework(root: string): LanguageFramework {
  const hasFile = (name: string) => fs.existsSync(path.join(root, name));

  let language: Finding<string> = { value: 'unknown', confidence: 'uncertain' };
  let framework: Finding<string> | undefined;

  if (hasFile('package.json')) {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));

    if (pkg.devDependencies?.typescript || hasFile('tsconfig.json')) {
      language = { value: 'typescript', confidence: 'observed' };
    } else {
      language = { value: 'javascript', confidence: 'observed' };
    }

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps.express) framework = { value: 'express', confidence: 'observed' };
    else if (deps.fastify) framework = { value: 'fastify', confidence: 'observed' };
    else if (deps.next) framework = { value: 'next', confidence: 'observed' };
    else if (deps.nuxt) framework = { value: 'nuxt', confidence: 'observed' };
    else if (deps.react) framework = { value: 'react', confidence: 'observed' };
    else if (deps.vue) framework = { value: 'vue', confidence: 'observed' };
    else if (deps['@angular/core']) framework = { value: 'angular', confidence: 'observed' };
  } else if (hasFile('go.mod')) {
    language = { value: 'go', confidence: 'observed' };
  } else if (hasFile('Cargo.toml')) {
    language = { value: 'rust', confidence: 'observed' };
  } else if (hasFile('requirements.txt') || hasFile('pyproject.toml')) {
    language = { value: 'python', confidence: 'observed' };
  }

  return { language, framework };
}
