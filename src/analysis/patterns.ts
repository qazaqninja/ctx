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

export type FlutterStateManagement = 'bloc' | 'riverpod' | 'provider' | 'getx' | 'none';

export interface FlutterStateManagementResult {
  pattern: FlutterStateManagement;
  confidence: Confidence;
  evidence: string[];
}

/**
 * Detects Flutter state management pattern from pubspec.yaml dependencies
 * and file naming conventions. Combines both signals for higher confidence.
 */
export function detectFlutterStateManagement(root: string, files: FileEntry[]): FlutterStateManagementResult {
  const evidence: string[] = [];
  let pubspecPattern: FlutterStateManagement = 'none';
  let filePattern: FlutterStateManagement = 'none';

  // Check pubspec.yaml for state management packages
  const pubspecPath = path.join(root, 'pubspec.yaml');
  if (fs.existsSync(pubspecPath)) {
    try {
      const pubspec = fs.readFileSync(pubspecPath, 'utf-8');

      // BLoC detection (flutter_bloc or bloc package)
      if (pubspec.includes('flutter_bloc:') || pubspec.includes('bloc:')) {
        pubspecPattern = 'bloc';
        evidence.push('flutter_bloc/bloc package in pubspec.yaml');
      }
      // Riverpod detection (flutter_riverpod, riverpod, or hooks_riverpod)
      else if (pubspec.includes('flutter_riverpod:') || pubspec.includes('riverpod:') || pubspec.includes('hooks_riverpod:')) {
        pubspecPattern = 'riverpod';
        evidence.push('riverpod package in pubspec.yaml');
      }
      // GetX detection
      else if (pubspec.includes('get:')) {
        pubspecPattern = 'getx';
        evidence.push('get package in pubspec.yaml');
      }
      // Provider detection (check after BLoC/Riverpod since they may also use provider)
      else if (pubspec.includes('provider:')) {
        pubspecPattern = 'provider';
        evidence.push('provider package in pubspec.yaml');
      }
    } catch {
      // Skip if can't read pubspec
    }
  }

  // Check file patterns for state management
  const blocFiles = files.filter(f => /_bloc\.dart$/.test(f.relativePath));
  const eventFiles = files.filter(f => /_event\.dart$/.test(f.relativePath));
  const stateFiles = files.filter(f => /_state\.dart$/.test(f.relativePath));
  const cubitFiles = files.filter(f => /_cubit\.dart$/.test(f.relativePath));
  const providerFiles = files.filter(f => /_provider\.dart$/.test(f.relativePath));
  const controllerFiles = files.filter(f => /_controller\.dart$/.test(f.relativePath));

  // BLoC pattern: _bloc.dart files AND (_event.dart OR _state.dart)
  if (blocFiles.length > 0 && (eventFiles.length > 0 || stateFiles.length > 0)) {
    filePattern = 'bloc';
    evidence.push(`${blocFiles.length} _bloc.dart, ${eventFiles.length} _event.dart, ${stateFiles.length} _state.dart files`);
  }
  // Cubit is also part of BLoC ecosystem
  else if (cubitFiles.length > 0 && stateFiles.length > 0) {
    filePattern = 'bloc';
    evidence.push(`${cubitFiles.length} _cubit.dart, ${stateFiles.length} _state.dart files (Cubit pattern)`);
  }
  // Riverpod: _provider.dart files (when riverpod is in pubspec)
  else if (providerFiles.length >= 2 && pubspecPattern === 'riverpod') {
    filePattern = 'riverpod';
    evidence.push(`${providerFiles.length} _provider.dart files`);
  }
  // GetX: _controller.dart files with get package
  else if (controllerFiles.length >= 2 && pubspecPattern === 'getx') {
    filePattern = 'getx';
    evidence.push(`${controllerFiles.length} _controller.dart files`);
  }
  // Provider: _provider.dart files with provider package
  else if (providerFiles.length >= 2 && pubspecPattern === 'provider') {
    filePattern = 'provider';
    evidence.push(`${providerFiles.length} _provider.dart files`);
  }

  // Determine final pattern and confidence
  let pattern: FlutterStateManagement = 'none';
  let confidence: Confidence = 'uncertain';

  if (pubspecPattern !== 'none' && filePattern !== 'none') {
    // Both pubspec and files agree - highest confidence
    if (pubspecPattern === filePattern) {
      pattern = pubspecPattern;
      confidence = 'observed';
    } else {
      // Pubspec and files disagree - trust pubspec but lower confidence
      pattern = pubspecPattern;
      confidence = 'inferred';
      evidence.push(`Note: pubspec indicates ${pubspecPattern} but file patterns suggest ${filePattern}`);
    }
  } else if (pubspecPattern !== 'none') {
    // Only pubspec indicates pattern
    pattern = pubspecPattern;
    confidence = 'inferred';
  } else if (filePattern !== 'none') {
    // Only files indicate pattern
    pattern = filePattern;
    confidence = 'inferred';
  }

  return { pattern, confidence, evidence };
}

export function detectAbstractions(files: FileEntry[]): Abstraction[] {
  const patterns = [
    // JavaScript/TypeScript patterns
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
    // Dart/Flutter patterns
    { name: 'model', pattern: /_model\.dart$/ },
    { name: 'service', pattern: /_service\.dart$/ },
    { name: 'repository', pattern: /_repository\.dart$/ },
    { name: 'provider', pattern: /_provider\.dart$/ },
    { name: 'controller', pattern: /_controller\.dart$/ },
    { name: 'bloc', pattern: /_bloc\.dart$/ },
    { name: 'cubit', pattern: /_cubit\.dart$/ },
    { name: 'event', pattern: /_event\.dart$/ },
    { name: 'state', pattern: /_state\.dart$/ },
    { name: 'page', pattern: /_page\.dart$/ },
    { name: 'screen', pattern: /_screen\.dart$/ },
    { name: 'widget', pattern: /_widget\.dart$/ },
    { name: 'usecase', pattern: /_usecase\.dart$/ },
    { name: 'entity', pattern: /_entity\.dart$/ },
    { name: 'datasource', pattern: /_datasource\.dart$/ },
    { name: 'dto', pattern: /_dto\.dart$/ },
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
  builtinPrefix: Finding<boolean>;
  order?: string[];
  /** @deprecated Use builtinPrefix instead */
  nodePrefix?: Finding<boolean>;
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
  const jsTsFiles = files.filter(f => f.extension === '.ts' || f.extension === '.js').slice(0, 20);
  const dartFiles = files.filter(f => f.extension === '.dart').slice(0, 20);

  // Determine primary language
  const isDartProject = dartFiles.length > jsTsFiles.length;

  let namedImports = 0;
  let defaultImports = 0;
  let nodePrefix = 0;
  let noNodePrefix = 0;

  // Handle JavaScript/TypeScript imports
  for (const file of jsTsFiles) {
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

  // Handle Dart imports
  let dartPackageImports = 0;
  let dartRelativeImports = 0;
  let dartSdkPrefix = 0;
  let noDartSdkPrefix = 0;

  for (const file of dartFiles) {
    try {
      const content = fs.readFileSync(file.path, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("import '") || trimmed.startsWith('import "')) {
          // Dart SDK imports (dart: prefix)
          if (trimmed.includes("'dart:") || trimmed.includes('"dart:')) {
            dartSdkPrefix++;
          } else if (trimmed.includes("'package:") || trimmed.includes('"package:')) {
            dartPackageImports++;
            namedImports++; // Package imports are like named imports
          } else {
            dartRelativeImports++;
            noDartSdkPrefix++;
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

  // Language-specific builtin prefix detection
  let builtinPrefixValue: boolean;
  let builtinPrefixConfidence: Confidence;
  let builtinPrefixEvidence: string[];

  if (isDartProject) {
    // Dart-specific: dart: prefix for SDK imports
    const totalDartImports = dartSdkPrefix + dartPackageImports + dartRelativeImports;
    if (totalDartImports === 0) {
      builtinPrefixValue = false;
      builtinPrefixConfidence = 'uncertain';
      builtinPrefixEvidence = ['No Dart imports found'];
    } else if (dartSdkPrefix > 0) {
      builtinPrefixValue = true;
      builtinPrefixConfidence = dartSdkPrefix > 2 ? 'observed' : 'inferred';
      builtinPrefixEvidence = [`Uses dart: prefix for SDK imports (${dartSdkPrefix} found), package: for dependencies (${dartPackageImports} found)`];
    } else {
      builtinPrefixValue = false;
      builtinPrefixConfidence = 'observed';
      builtinPrefixEvidence = [`Uses package: imports (${dartPackageImports} found), relative imports (${dartRelativeImports} found)`];
    }
  } else {
    // JavaScript/TypeScript: node: prefix for builtins
    const totalNodeImports = nodePrefix + noNodePrefix;
    if (totalNodeImports === 0) {
      builtinPrefixValue = false;
      builtinPrefixConfidence = 'uncertain';
      builtinPrefixEvidence = ['No Node.js builtin imports found'];
    } else if (nodePrefix > noNodePrefix) {
      builtinPrefixValue = true;
      builtinPrefixConfidence = nodePrefix > noNodePrefix * 2 ? 'observed' : 'inferred';
      builtinPrefixEvidence = ['Uses node: prefix for builtins'];
    } else {
      builtinPrefixValue = false;
      builtinPrefixConfidence = noNodePrefix > nodePrefix * 2 ? 'observed' : 'inferred';
      builtinPrefixEvidence = ['No node: prefix for builtins'];
    }
  }

  return {
    style: {
      value: styleValue,
      confidence: styleConfidence,
      evidence: isDartProject
        ? [`${dartPackageImports} package imports, ${dartRelativeImports} relative imports`]
        : [`${namedImports} named imports, ${defaultImports} default imports`]
    },
    builtinPrefix: {
      value: builtinPrefixValue,
      confidence: builtinPrefixConfidence,
      evidence: builtinPrefixEvidence
    },
    // Keep nodePrefix for backward compatibility
    nodePrefix: {
      value: builtinPrefixValue,
      confidence: builtinPrefixConfidence,
      evidence: builtinPrefixEvidence
    },
  };
}

export function detectCodeNaming(files: FileEntry[]): CodeNaming {
  const jsTsFiles = files.filter(f => f.extension === '.ts' || f.extension === '.js').slice(0, 30);
  const dartFiles = files.filter(f => f.extension === '.dart').slice(0, 30);

  const functionNames: string[] = [];
  const classNames: string[] = [];
  const variableNames: string[] = [];

  // JavaScript/TypeScript naming detection
  for (const file of jsTsFiles) {
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

  // Dart naming detection
  for (const file of dartFiles) {
    try {
      const content = fs.readFileSync(file.path, 'utf-8');

      // Extract Dart function names (return type followed by function name)
      const dartFuncMatches = content.matchAll(/(?:Future<[^>]+>|void|String|int|bool|double|dynamic|List<[^>]+>|Map<[^>]+>|[A-Z][A-Za-z0-9_<>]*)\s+([a-z_][A-Za-z0-9_]*)\s*\(/g);
      for (const match of dartFuncMatches) {
        if (match[1] && match[1].length > 2) functionNames.push(match[1]);
      }

      // Extract Dart class names (including mixin, extension)
      const dartClassMatches = content.matchAll(/(?:class|mixin|extension)\s+([A-Za-z_][A-Za-z0-9_]*)/g);
      for (const match of dartClassMatches) {
        if (match[1]) classNames.push(match[1]);
      }

      // Extract Dart variable names (final, var, const, or type annotations)
      const dartVarMatches = content.matchAll(/(?:final|var|const|late)\s+(?:[A-Za-z_][A-Za-z0-9_<>]*\s+)?([a-z_][A-Za-z0-9_]*)\s*[;=]/g);
      for (const match of dartVarMatches) {
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

// Flutter/Dart package mappings - common packages and their purposes
export const FLUTTER_PACKAGE_MAPPINGS: Record<string, string> = {
  // State Management
  'flutter_bloc': 'State management - BLoC pattern',
  'bloc': 'State management - BLoC pattern (core)',
  'flutter_riverpod': 'State management - Riverpod',
  'riverpod': 'State management - Riverpod (core)',
  'hooks_riverpod': 'State management - Riverpod with hooks',
  'provider': 'State management - Provider pattern',
  'get': 'State management - GetX (reactive state, routing, DI)',
  'getx': 'State management - GetX (reactive state, routing, DI)',
  'mobx': 'State management - MobX (observable state)',
  'flutter_mobx': 'State management - MobX integration',
  'redux': 'State management - Redux pattern',
  'flutter_redux': 'State management - Redux integration',
  'stacked': 'State management - MVVM architecture framework',

  // Routing
  'go_router': 'Declarative routing',
  'auto_route': 'Code-generated routing',
  'beamer': 'Declarative routing with Navigator 2.0',
  'routemaster': 'Navigation and routing',

  // Database & Storage
  'drift': 'SQLite ORM with type-safe queries',
  'moor': 'SQLite ORM (legacy name for drift)',
  'sqflite': 'SQLite database plugin',
  'hive': 'Lightweight key-value database',
  'isar': 'High-performance local database',
  'objectbox': 'Fast local object database',
  'shared_preferences': 'Simple key-value persistent storage',
  'flutter_secure_storage': 'Secure storage for sensitive data',

  // Networking
  'dio': 'HTTP client with interceptors',
  'http': 'Basic HTTP client',
  'retrofit': 'Type-safe HTTP client generator',
  'chopper': 'HTTP client generator',
  'graphql_flutter': 'GraphQL client',

  // Code Generation & Serialization
  'freezed': 'Immutable data classes with unions',
  'freezed_annotation': 'Freezed annotations',
  'json_serializable': 'JSON serialization code generator',
  'json_annotation': 'JSON annotation support',
  'built_value': 'Immutable value types',
  'equatable': 'Value equality for classes',
  'copy_with_extension': 'CopyWith method generator',

  // Dependency Injection
  'injectable': 'Dependency injection code generator',
  'get_it': 'Service locator / DI container',
  'kiwi': 'Dependency injection',
  'injector': 'Dependency injection',

  // UI Components
  'flutter_hooks': 'React-style hooks for Flutter',
  'flutter_screenutil': 'Screen adaptation and responsive UI',
  'cached_network_image': 'Image caching and loading',
  'flutter_svg': 'SVG rendering',
  'lottie': 'Lottie animation support',
  'shimmer': 'Shimmer loading effect',
  'flutter_spinkit': 'Loading spinners',
  'animations': 'Pre-built animations',

  // Forms & Validation
  'flutter_form_builder': 'Form building and validation',
  'reactive_forms': 'Reactive form handling',
  'formz': 'Form input validation',

  // Testing
  'mocktail': 'Mocking library for tests',
  'mockito': 'Mocking framework',
  'bloc_test': 'Testing utilities for BLoC',
  'flutter_test': 'Flutter testing framework',
  'integration_test': 'Integration testing',

  // Firebase
  'firebase_core': 'Firebase core functionality',
  'firebase_auth': 'Firebase authentication',
  'cloud_firestore': 'Firebase Cloud Firestore',
  'firebase_storage': 'Firebase Storage',
  'firebase_messaging': 'Firebase Cloud Messaging (push notifications)',
  'firebase_analytics': 'Firebase Analytics',
  'firebase_crashlytics': 'Firebase Crashlytics (crash reporting)',
  'firebase_remote_config': 'Firebase Remote Config',

  // Authentication
  'google_sign_in': 'Google Sign-In',
  'sign_in_with_apple': 'Apple Sign-In',
  'flutter_facebook_auth': 'Facebook authentication',
  'local_auth': 'Biometric authentication',

  // Utilities
  'dartz': 'Functional programming (Either, Option types)',
  'fpdart': 'Functional programming utilities',
  'rxdart': 'Reactive extensions for Dart',
  'intl': 'Internationalization and localization',
  'easy_localization': 'Easy localization',
  'logger': 'Pretty logging',
  'talker': 'Logging and error handling',
  'path_provider': 'File system paths',
  'url_launcher': 'URL launching',
  'permission_handler': 'Permission management',
  'connectivity_plus': 'Network connectivity',
  'device_info_plus': 'Device information',
  'package_info_plus': 'Package/app information',
  'image_picker': 'Image selection from gallery/camera',
  'camera': 'Camera access',
  'geolocator': 'Geolocation',
  'flutter_local_notifications': 'Local notifications',
  'workmanager': 'Background tasks',
  'flutter_background_service': 'Background service',

  // Architecture
  'very_good_analysis': 'Strict lint rules (VGV style)',
  'lint': 'Lint rules',
  'pedantic': 'Google Dart style lint rules',
};

export interface DependencyInfo {
  name: string;
  version?: string;
  purpose: string;
  confidence: Confidence;
}

export interface DependencyContext {
  dependencies: DependencyInfo[];
  devDependencies: DependencyInfo[];
  categories: {
    stateManagement?: string[];
    routing?: string[];
    database?: string[];
    networking?: string[];
    codeGeneration?: string[];
    dependencyInjection?: string[];
    testing?: string[];
    firebase?: string[];
    utilities?: string[];
  };
}

/**
 * Detects dependency context from pubspec.yaml for Dart/Flutter projects.
 * Maps common Flutter packages to their purposes to help AI understand
 * the technology stack.
 */
export function detectDependencyContext(root: string): DependencyContext | null {
  const pubspecPath = path.join(root, 'pubspec.yaml');

  if (!fs.existsSync(pubspecPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(pubspecPath, 'utf-8');

    // Simple YAML parsing for dependencies section
    const dependencies: DependencyInfo[] = [];
    const devDependencies: DependencyInfo[] = [];
    const categories: DependencyContext['categories'] = {};

    // Parse dependencies section
    const depsMatch = content.match(/^dependencies:\s*\n((?:[ \t]+[^\n]+\n?)*)/m);
    if (depsMatch) {
      const depsSection = depsMatch[1];
      const depLines = depsSection.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));

      for (const line of depLines) {
        const depMatch = line.match(/^\s+([a-z_][a-z0-9_]*):\s*(.+)?$/i);
        if (depMatch) {
          const name = depMatch[1];
          const versionPart = depMatch[2]?.trim();

          // Skip flutter SDK dependency
          if (name === 'flutter' && versionPart?.includes('sdk:')) continue;

          const purpose = FLUTTER_PACKAGE_MAPPINGS[name] || 'Unknown package';
          const confidence: Confidence = FLUTTER_PACKAGE_MAPPINGS[name] ? 'observed' : 'uncertain';

          dependencies.push({
            name,
            version: versionPart && !versionPart.startsWith('^') ? undefined : versionPart,
            purpose,
            confidence,
          });

          // Categorize
          categorizePackage(name, categories);
        }
      }
    }

    // Parse dev_dependencies section
    const devDepsMatch = content.match(/^dev_dependencies:\s*\n((?:[ \t]+[^\n]+\n?)*)/m);
    if (devDepsMatch) {
      const devDepsSection = devDepsMatch[1];
      const depLines = devDepsSection.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));

      for (const line of depLines) {
        const depMatch = line.match(/^\s+([a-z_][a-z0-9_]*):\s*(.+)?$/i);
        if (depMatch) {
          const name = depMatch[1];
          const versionPart = depMatch[2]?.trim();

          // Skip flutter_test SDK dependency
          if (name === 'flutter_test' && versionPart?.includes('sdk:')) continue;
          if (name === 'flutter_lints') continue; // Common dev dep, skip

          const purpose = FLUTTER_PACKAGE_MAPPINGS[name] || 'Development tool';
          const confidence: Confidence = FLUTTER_PACKAGE_MAPPINGS[name] ? 'observed' : 'uncertain';

          devDependencies.push({
            name,
            version: versionPart && !versionPart.startsWith('^') ? undefined : versionPart,
            purpose,
            confidence,
          });

          // Categorize
          categorizePackage(name, categories);
        }
      }
    }

    return {
      dependencies,
      devDependencies,
      categories,
    };
  } catch {
    return null;
  }
}

function categorizePackage(name: string, categories: DependencyContext['categories']): void {
  const stateManagement = ['flutter_bloc', 'bloc', 'flutter_riverpod', 'riverpod', 'hooks_riverpod', 'provider', 'get', 'getx', 'mobx', 'flutter_mobx', 'redux', 'flutter_redux', 'stacked'];
  const routing = ['go_router', 'auto_route', 'beamer', 'routemaster'];
  const database = ['drift', 'moor', 'sqflite', 'hive', 'isar', 'objectbox', 'shared_preferences', 'flutter_secure_storage'];
  const networking = ['dio', 'http', 'retrofit', 'chopper', 'graphql_flutter'];
  const codeGeneration = ['freezed', 'freezed_annotation', 'json_serializable', 'json_annotation', 'built_value', 'copy_with_extension'];
  const dependencyInjection = ['injectable', 'get_it', 'kiwi', 'injector'];
  const testing = ['mocktail', 'mockito', 'bloc_test'];
  const firebase = ['firebase_core', 'firebase_auth', 'cloud_firestore', 'firebase_storage', 'firebase_messaging', 'firebase_analytics', 'firebase_crashlytics', 'firebase_remote_config'];

  if (stateManagement.includes(name)) {
    categories.stateManagement = categories.stateManagement || [];
    if (!categories.stateManagement.includes(name)) categories.stateManagement.push(name);
  }
  if (routing.includes(name)) {
    categories.routing = categories.routing || [];
    if (!categories.routing.includes(name)) categories.routing.push(name);
  }
  if (database.includes(name)) {
    categories.database = categories.database || [];
    if (!categories.database.includes(name)) categories.database.push(name);
  }
  if (networking.includes(name)) {
    categories.networking = categories.networking || [];
    if (!categories.networking.includes(name)) categories.networking.push(name);
  }
  if (codeGeneration.includes(name)) {
    categories.codeGeneration = categories.codeGeneration || [];
    if (!categories.codeGeneration.includes(name)) categories.codeGeneration.push(name);
  }
  if (dependencyInjection.includes(name)) {
    categories.dependencyInjection = categories.dependencyInjection || [];
    if (!categories.dependencyInjection.includes(name)) categories.dependencyInjection.push(name);
  }
  if (testing.includes(name)) {
    categories.testing = categories.testing || [];
    if (!categories.testing.includes(name)) categories.testing.push(name);
  }
  if (firebase.includes(name)) {
    categories.firebase = categories.firebase || [];
    if (!categories.firebase.includes(name)) categories.firebase.push(name);
  }
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
  } else if (hasFile('pubspec.yaml')) {
    language = { value: 'dart', confidence: 'observed' };

    // Detect Flutter framework from pubspec.yaml
    try {
      const pubspec = fs.readFileSync(path.join(root, 'pubspec.yaml'), 'utf-8');
      if (pubspec.includes('flutter:') || pubspec.includes('flutter_test:')) {
        framework = { value: 'flutter', confidence: 'observed' };
      }

      // Use comprehensive state management detection (combines pubspec + file patterns)
      if (files && files.length > 0) {
        const stateManagement = detectFlutterStateManagement(root, files);
        if (stateManagement.pattern !== 'none') {
          const statePatternNames: Record<FlutterStateManagement, string> = {
            bloc: 'BLoC',
            riverpod: 'Riverpod',
            provider: 'Provider',
            getx: 'GetX',
            none: '',
          };
          framework = {
            value: `flutter (${statePatternNames[stateManagement.pattern]})`,
            confidence: stateManagement.confidence,
            evidence: stateManagement.evidence,
          };
        }
      } else {
        // Fallback: detect state management patterns from pubspec only
        if (pubspec.includes('flutter_bloc:') || pubspec.includes('bloc:')) {
          framework = { value: 'flutter (BLoC)', confidence: 'inferred', evidence: ['flutter_bloc/bloc package in pubspec.yaml'] };
        } else if (pubspec.includes('flutter_riverpod:') || pubspec.includes('riverpod:')) {
          framework = { value: 'flutter (Riverpod)', confidence: 'inferred', evidence: ['riverpod package in pubspec.yaml'] };
        } else if (pubspec.includes('get:')) {
          framework = { value: 'flutter (GetX)', confidence: 'inferred', evidence: ['get package in pubspec.yaml'] };
        } else if (pubspec.includes('provider:')) {
          framework = { value: 'flutter (Provider)', confidence: 'inferred', evidence: ['provider package in pubspec.yaml'] };
        }
      }
    } catch {
      // Skip if can't read pubspec
    }
  }

  return { language, framework };
}
