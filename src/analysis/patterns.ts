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

export interface FormattingStyle {
  indent: Finding<string>;
  quotes: Finding<'single' | 'double' | 'mixed'>;
  semicolons: Finding<boolean>;
}

export interface ImportStyle {
  style: Finding<'named' | 'default' | 'mixed'>;
  nodePrefix: Finding<boolean>;
  order?: string[];
}

export interface CodeNaming {
  functions: Finding<NamingStyle>;
  classes: Finding<NamingStyle>;
  variables: Finding<NamingStyle>;
}

export function detectFormatting(files: FileEntry[]): FormattingStyle {
  const samples = files.slice(0, 20); // Sample first 20 files

  let twoSpace = 0;
  let fourSpace = 0;
  let tabs = 0;
  let singleQuotes = 0;
  let doubleQuotes = 0;
  let withSemi = 0;
  let withoutSemi = 0;
  let filesAnalyzed = 0;

  for (const file of samples) {
    try {
      const content = fs.readFileSync(file.path, 'utf-8');
      const lines = content.split('\n').slice(0, 100); // First 100 lines
      filesAnalyzed++;

      for (const line of lines) {
        // Detect indentation
        const indentMatch = line.match(/^(\s+)/);
        if (indentMatch) {
          const indent = indentMatch[1];
          if (indent.startsWith('\t')) tabs++;
          else if (indent.startsWith('    ')) fourSpace++;
          else if (indent.startsWith('  ')) twoSpace++;
        }

        // Detect quotes (in imports and strings)
        const singleMatch = line.match(/'/g);
        const doubleMatch = line.match(/"/g);
        if (singleMatch) singleQuotes += singleMatch.length;
        if (doubleMatch) doubleQuotes += doubleMatch.length;

        // Detect semicolons (on non-empty, non-comment lines)
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('*')) {
          if (trimmed.endsWith(';')) withSemi++;
          else if (trimmed.endsWith('{') || trimmed.endsWith('}') || trimmed.endsWith(',')) {
            // Structural, don't count
          } else if (trimmed.length > 5) {
            withoutSemi++;
          }
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Determine indent style
  let indentValue: string;
  let indentConfidence: Confidence;
  const maxIndent = Math.max(twoSpace, fourSpace, tabs);
  if (maxIndent === 0) {
    indentValue = '2 spaces';
    indentConfidence = 'uncertain';
  } else if (tabs === maxIndent) {
    indentValue = 'tabs';
    indentConfidence = tabs > twoSpace + fourSpace ? 'observed' : 'inferred';
  } else if (fourSpace === maxIndent) {
    indentValue = '4 spaces';
    indentConfidence = fourSpace > twoSpace + tabs ? 'observed' : 'inferred';
  } else {
    indentValue = '2 spaces';
    indentConfidence = twoSpace > fourSpace + tabs ? 'observed' : 'inferred';
  }

  // Determine quote style
  let quotesValue: 'single' | 'double' | 'mixed';
  let quotesConfidence: Confidence;
  const totalQuotes = singleQuotes + doubleQuotes;
  if (totalQuotes === 0) {
    quotesValue = 'single';
    quotesConfidence = 'uncertain';
  } else if (singleQuotes > doubleQuotes * 2) {
    quotesValue = 'single';
    quotesConfidence = 'observed';
  } else if (doubleQuotes > singleQuotes * 2) {
    quotesValue = 'double';
    quotesConfidence = 'observed';
  } else {
    quotesValue = 'mixed';
    quotesConfidence = 'observed';
  }

  // Determine semicolon usage
  let semiValue: boolean;
  let semiConfidence: Confidence;
  const totalSemi = withSemi + withoutSemi;
  if (totalSemi === 0) {
    semiValue = true;
    semiConfidence = 'uncertain';
  } else if (withSemi > withoutSemi * 2) {
    semiValue = true;
    semiConfidence = 'observed';
  } else if (withoutSemi > withSemi * 2) {
    semiValue = false;
    semiConfidence = 'observed';
  } else {
    semiValue = withSemi > withoutSemi;
    semiConfidence = 'inferred';
  }

  return {
    indent: {
      value: indentValue,
      confidence: indentConfidence,
      evidence: [`Analyzed ${filesAnalyzed} files`]
    },
    quotes: {
      value: quotesValue,
      confidence: quotesConfidence,
      evidence: [`${singleQuotes} single vs ${doubleQuotes} double quotes`]
    },
    semicolons: {
      value: semiValue,
      confidence: semiConfidence,
      evidence: [`${withSemi} lines with semicolons, ${withoutSemi} without`]
    },
  };
}

export function detectImportStyle(files: FileEntry[]): ImportStyle {
  const samples = files.filter(f => f.extension === '.ts' || f.extension === '.js').slice(0, 20);

  let namedImports = 0;
  let defaultImports = 0;
  let nodePrefix = 0;
  let noNodePrefix = 0;

  for (const file of samples) {
    try {
      const content = fs.readFileSync(file.path, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        if (line.startsWith('import ')) {
          // Check for named vs default imports
          if (line.includes('{')) {
            namedImports++;
          } else if (line.match(/import \w+ from/)) {
            defaultImports++;
          }

          // Check for node: prefix
          if (line.includes("'node:") || line.includes('"node:')) {
            nodePrefix++;
          } else if (line.match(/from ['"](?:fs|path|http|https|crypto|os|util|stream|events|child_process|buffer)['"]/)) {
            noNodePrefix++;
          }
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  const totalImports = namedImports + defaultImports;
  let styleValue: 'named' | 'default' | 'mixed';
  let styleConfidence: Confidence;

  if (totalImports === 0) {
    styleValue = 'named';
    styleConfidence = 'uncertain';
  } else if (namedImports > defaultImports * 2) {
    styleValue = 'named';
    styleConfidence = 'observed';
  } else if (defaultImports > namedImports * 2) {
    styleValue = 'default';
    styleConfidence = 'observed';
  } else {
    styleValue = 'mixed';
    styleConfidence = 'observed';
  }

  const totalNodeImports = nodePrefix + noNodePrefix;
  let nodePrefixValue: boolean;
  let nodePrefixConfidence: Confidence;

  if (totalNodeImports === 0) {
    nodePrefixValue = false;
    nodePrefixConfidence = 'uncertain';
  } else if (nodePrefix > noNodePrefix) {
    nodePrefixValue = true;
    nodePrefixConfidence = nodePrefix > noNodePrefix * 2 ? 'observed' : 'inferred';
  } else {
    nodePrefixValue = false;
    nodePrefixConfidence = noNodePrefix > nodePrefix * 2 ? 'observed' : 'inferred';
  }

  return {
    style: {
      value: styleValue,
      confidence: styleConfidence,
      evidence: [`${namedImports} named imports, ${defaultImports} default imports`]
    },
    nodePrefix: {
      value: nodePrefixValue,
      confidence: nodePrefixConfidence,
      evidence: nodePrefixValue ? ['Uses node: prefix for builtins'] : ['No node: prefix for builtins']
    },
  };
}

export function detectCodeNaming(files: FileEntry[]): CodeNaming {
  const samples = files.filter(f => f.extension === '.ts' || f.extension === '.js').slice(0, 30);

  const functionNames: string[] = [];
  const classNames: string[] = [];
  const variableNames: string[] = [];

  for (const file of samples) {
    try {
      const content = fs.readFileSync(file.path, 'utf-8');

      // Extract function names
      const funcMatches = content.matchAll(/(?:function|const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:=\s*(?:async\s*)?\(|=\s*(?:async\s*)?function|\()/g);
      for (const match of funcMatches) {
        if (match[1] && match[1].length > 2) functionNames.push(match[1]);
      }

      // Extract arrow functions assigned to const/let
      const arrowMatches = content.matchAll(/(?:const|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::|=>)/g);
      for (const match of arrowMatches) {
        if (match[1] && match[1].length > 2) functionNames.push(match[1]);
      }

      // Extract class names
      const classMatches = content.matchAll(/class\s+([A-Za-z_$][A-Za-z0-9_$]*)/g);
      for (const match of classMatches) {
        if (match[1]) classNames.push(match[1]);
      }

      // Extract const/let variable names (not functions)
      const varMatches = content.matchAll(/(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?::|=\s*[^(=])/g);
      for (const match of varMatches) {
        if (match[1] && match[1].length > 2 && !functionNames.includes(match[1])) {
          variableNames.push(match[1]);
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  const detectMajorityStyle = (names: string[]): Finding<NamingStyle> => {
    if (names.length === 0) {
      return { value: 'camelCase', confidence: 'uncertain' };
    }

    const counts: Record<NamingStyle, number> = {
      'kebab-case': 0,
      'snake_case': 0,
      'camelCase': 0,
      'PascalCase': 0,
      'mixed': 0,
    };

    for (const name of names) {
      counts[detectCase(name)]++;
    }

    let maxStyle: NamingStyle = 'camelCase';
    let maxCount = 0;
    for (const [style, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        maxStyle = style as NamingStyle;
      }
    }

    const consistency = maxCount / names.length;
    return {
      value: maxStyle,
      confidence: calculateConfidence(consistency),
      evidence: [`${maxCount}/${names.length} identifiers use ${maxStyle}`],
    };
  };

  return {
    functions: detectMajorityStyle(functionNames),
    classes: detectMajorityStyle(classNames),
    variables: detectMajorityStyle(variableNames),
  };
}

export function detectMonorepo(root: string): Finding<boolean> {
  const hasFile = (name: string) => fs.existsSync(path.join(root, name));
  const hasDir = (name: string) => {
    try {
      return fs.statSync(path.join(root, name)).isDirectory();
    } catch {
      return false;
    }
  };

  const evidence: string[] = [];
  let isMonorepo = false;

  if (hasFile('lerna.json')) {
    isMonorepo = true;
    evidence.push('Found lerna.json');
  }

  if (hasDir('packages') || hasDir('apps')) {
    const packagesDir = hasDir('packages') ? 'packages' : 'apps';
    try {
      const subDirs = fs.readdirSync(path.join(root, packagesDir));
      const hasMultiplePackages = subDirs.filter(d =>
        fs.statSync(path.join(root, packagesDir, d)).isDirectory()
      ).length > 1;
      if (hasMultiplePackages) {
        isMonorepo = true;
        evidence.push(`Found ${packagesDir}/ with multiple packages`);
      }
    } catch {
      // Skip
    }
  }

  if (hasFile('pnpm-workspace.yaml')) {
    isMonorepo = true;
    evidence.push('Found pnpm-workspace.yaml');
  }

  if (hasFile('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
      if (pkg.workspaces) {
        isMonorepo = true;
        evidence.push('Found workspaces in package.json');
      }
    } catch {
      // Skip
    }
  }

  return {
    value: isMonorepo,
    confidence: evidence.length > 0 ? 'observed' : 'uncertain',
    evidence: evidence.length > 0 ? evidence : ['No monorepo indicators found'],
  };
}

export interface LanguageFramework {
  language: Finding<string>;
  framework?: Finding<string>;
  isMonorepo?: Finding<boolean>;
}

export function detectLanguageFramework(root: string, files?: FileEntry[]): LanguageFramework {
  const hasFile = (name: string) => fs.existsSync(path.join(root, name));
  const hasAnyFile = (pattern: string) => {
    try {
      const matches = fs.readdirSync(root, { recursive: true }) as string[];
      return matches.some(f => f.endsWith(pattern));
    } catch {
      return false;
    }
  };

  let language: Finding<string> = { value: 'unknown', confidence: 'uncertain' };
  let framework: Finding<string> | undefined;

  // Check file extensions from scanned files
  if (files && files.length > 0) {
    const tsFiles = files.filter(f => f.extension === '.ts' || f.extension === '.tsx').length;
    const jsFiles = files.filter(f => f.extension === '.js' || f.extension === '.jsx').length;

    if (tsFiles > jsFiles) {
      language = {
        value: 'typescript',
        confidence: 'observed',
        evidence: [`${tsFiles} TypeScript files found`]
      };
    } else if (jsFiles > 0) {
      language = {
        value: 'javascript',
        confidence: 'observed',
        evidence: [`${jsFiles} JavaScript files found`]
      };
    }
  }

  if (hasFile('package.json')) {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));

    // Override with more specific detection if we haven't detected from files
    if (language.value === 'unknown') {
      if (pkg.devDependencies?.typescript || hasFile('tsconfig.json') || hasAnyFile('tsconfig.json')) {
        language = { value: 'typescript', confidence: 'observed' };
      } else {
        language = { value: 'javascript', confidence: 'observed' };
      }
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
