import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import type { Manifest, Conventions, Architecture, FullContext, Finding } from '../types/schema.js';

export interface AIConstraints {
  architecture_rules: string[];
  conventions: string[];
  constraints: string[];
  uncertain: string[];
}

export interface ExtendedContext extends FullContext {
  aiConstraints?: AIConstraints;
  semanticPatterns?: Array<{
    name: string;
    description: string;
    confidence: string;
    files: string[];
  }>;
}

export async function loadContext(ctxPath: string): Promise<ExtendedContext> {
  const readYaml = <T>(name: string): T => {
    const filePath = path.join(ctxPath, name);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing ${name}`);
    }
    return YAML.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  };

  const readOptionalYaml = <T>(name: string): T | undefined => {
    const filePath = path.join(ctxPath, name);
    if (!fs.existsSync(filePath)) {
      return undefined;
    }
    return YAML.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  };

  const architecture = readYaml<Architecture & { semantic_patterns?: unknown[] }>('architecture.yaml');

  return {
    manifest: readYaml<Manifest>('manifest.yaml'),
    conventions: readYaml<Conventions>('conventions.yaml'),
    architecture,
    exclusions: readYaml<{ paths: string[] }>('exclusions.yaml'),
    aiConstraints: readOptionalYaml<AIConstraints>('constraints.yaml'),
    semanticPatterns: architecture.semantic_patterns as ExtendedContext['semanticPatterns'],
  };
}

export function explainArchitecture(arch: Architecture): string {
  const lines: string[] = [];

  if (arch.isMonorepo?.value) {
    lines.push(`- Monorepo structure (${arch.isMonorepo.evidence?.join(', ') || 'multiple packages'})`);
  }

  if (arch.structure?.value) {
    const patterns: Record<string, string> = {
      'vertical-features': 'Vertical feature folders (domain-driven organization)',
      'layered': 'Layered architecture (controllers/services/repositories)',
      'modular': 'Modular structure (feature-based but less strict)',
      'flat': 'Flat structure (minimal nesting)',
    };
    lines.push(`- ${patterns[arch.structure.value] || arch.structure.value}`);
  }

  // State management pattern (Flutter-specific)
  if (arch.patterns?.state_management?.value) {
    const stateManagementDescriptions: Record<string, string> = {
      'BLoC pattern': 'BLoC state management (event-driven, unidirectional data flow)',
      'Riverpod pattern': 'Riverpod state management (compile-safe, testable providers)',
      'Provider pattern': 'Provider state management (InheritedWidget-based)',
      'GetX pattern': 'GetX state management (reactive, minimal boilerplate)',
    };
    const description = stateManagementDescriptions[arch.patterns.state_management.value]
      || arch.patterns.state_management.value;
    lines.push(`- ${description}`);

    // Add evidence if available
    if (arch.patterns.state_management.evidence?.length) {
      lines.push(`  Evidence: ${arch.patterns.state_management.evidence.join(', ')}`);
    }
  }

  if (arch.patterns?.persistence?.value) {
    lines.push(`- ${capitalize(arch.patterns.persistence.value)} pattern for data access`);
  }

  if (arch.patterns?.error_handling?.value) {
    lines.push(`- ${arch.patterns.error_handling.value} for error handling`);
  }

  if (arch.boundaries && arch.boundaries.length > 0) {
    // Group Flutter-specific boundaries for cleaner output
    const flutterStateManagement = ['bloc', 'cubit', 'event', 'state', 'provider', 'controller'];
    const flutterUI = ['page', 'screen', 'widget'];
    const dataLayer = ['repository', 'datasource', 'model', 'entity', 'dto', 'service', 'usecase'];

    const stateManagementBoundaries = arch.boundaries.filter(b => flutterStateManagement.includes(b.name));
    const uiBoundaries = arch.boundaries.filter(b => flutterUI.includes(b.name));
    const dataBoundaries = arch.boundaries.filter(b => dataLayer.includes(b.name));
    const otherBoundaries = arch.boundaries.filter(b =>
      !flutterStateManagement.includes(b.name) &&
      !flutterUI.includes(b.name) &&
      !dataLayer.includes(b.name)
    );

    if (stateManagementBoundaries.length > 0) {
      lines.push(`- State management layers: ${stateManagementBoundaries.map(b => b.name).join(', ')}`);
    }
    if (uiBoundaries.length > 0) {
      lines.push(`- UI layers: ${uiBoundaries.map(b => b.name).join(', ')}`);
    }
    if (dataBoundaries.length > 0) {
      lines.push(`- Data layers: ${dataBoundaries.map(b => b.name).join(', ')}`);
    }
    if (otherBoundaries.length > 0) {
      lines.push(`- Other abstractions: ${otherBoundaries.map(b => b.name).join(', ')}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : '- No clear architecture patterns detected';
}

export function explainConventions(conv: Conventions): string {
  const lines: string[] = [];

  if (conv.naming) {
    const parts: string[] = [];
    if (conv.naming.files?.value) parts.push(`${conv.naming.files.value} files`);
    if (conv.naming.classes?.value) parts.push(`${conv.naming.classes.value} classes`);
    if (conv.naming.functions?.value) parts.push(`${conv.naming.functions.value} functions`);
    if (parts.length > 0) {
      lines.push(`- Naming: ${parts.join(', ')}`);
    }
  }

  if (conv.formatting) {
    const parts: string[] = [];
    if (conv.formatting.indent?.value) parts.push(conv.formatting.indent.value);
    if (conv.formatting.quotes?.value) parts.push(`${conv.formatting.quotes.value} quotes`);
    if (conv.formatting.semicolons?.value !== undefined) {
      parts.push(conv.formatting.semicolons.value ? 'semicolons' : 'no semicolons');
    }
    if (parts.length > 0) {
      lines.push(`- Formatting: ${parts.join(', ')}`);
    }
  }

  if (conv.imports) {
    const parts: string[] = [];
    if (conv.imports.style?.value) parts.push(`${conv.imports.style.value} imports`);
    // Use builtinPrefix with evidence (falls back to nodePrefix for compatibility)
    const builtinPref = conv.imports.builtinPrefix || conv.imports.nodePrefix;
    if (builtinPref?.value && builtinPref.evidence?.length) {
      // Use the first evidence string which contains the language-appropriate description
      parts.push(builtinPref.evidence[0]);
    }
    if (parts.length > 0) {
      lines.push(`- Imports: ${parts.join(', ')}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : '';
}

export function explainUncertain(context: FullContext): string {
  const uncertain: string[] = [];

  const checkUncertain = (obj: unknown, prefix: string): void => {
    if (!obj || typeof obj !== 'object') return;

    if ('confidence' in obj && (obj as Finding<unknown>).confidence === 'uncertain') {
      const value = (obj as Finding<unknown>).value;
      if (value && value !== '' && !(Array.isArray(value) && value.length === 0)) {
        uncertain.push(`- ${prefix}: ${value}`);
      }
    }

    for (const [key, val] of Object.entries(obj)) {
      if (key !== 'confidence' && key !== 'value' && key !== 'evidence') {
        checkUncertain(val, prefix ? `${prefix}.${key}` : key);
      }
    }
  };

  checkUncertain(context.conventions, 'conventions');
  checkUncertain(context.architecture, 'architecture');

  return uncertain.join('\n');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function explainSemanticPatterns(patterns: ExtendedContext['semanticPatterns']): string {
  if (!patterns || patterns.length === 0) return '';

  // Group patterns by architectural layer for cleaner presentation
  const stateManagement: typeof patterns = [];
  const dataLayer: typeof patterns = [];
  const uiLayer: typeof patterns = [];
  const other: typeof patterns = [];

  for (const p of patterns) {
    const name = p.name.toLowerCase();
    if (name.includes('bloc') || name.includes('cubit') || name.includes('state') ||
        name.includes('event') || name.includes('provider') || name.includes('notifier') ||
        name.includes('redux') || name.includes('store') || name.includes('slice')) {
      stateManagement.push(p);
    } else if (name.includes('repository') || name.includes('service') || name.includes('usecase') ||
               name.includes('entity') || name.includes('model') || name.includes('dto') ||
               name.includes('datasource') || name.includes('data source')) {
      dataLayer.push(p);
    } else if (name.includes('page') || name.includes('screen') || name.includes('widget') ||
               name.includes('view') || name.includes('component') || name.includes('hook')) {
      uiLayer.push(p);
    } else {
      other.push(p);
    }
  }

  const lines: string[] = [];

  // State management section
  if (stateManagement.length > 0) {
    lines.push('State Management:');
    for (const p of stateManagement) {
      const detail = p.confidence === 'observed' ? '' : ` [${p.confidence}]`;
      lines.push(`  - ${p.name}: ${p.description}${detail}`);
    }
  }

  // Data layer section
  if (dataLayer.length > 0) {
    lines.push('Data Layer:');
    for (const p of dataLayer) {
      const detail = p.confidence === 'observed' ? '' : ` [${p.confidence}]`;
      lines.push(`  - ${p.name}: ${p.description}${detail}`);
    }
  }

  // UI layer section
  if (uiLayer.length > 0) {
    lines.push('UI Layer:');
    for (const p of uiLayer) {
      const detail = p.confidence === 'observed' ? '' : ` [${p.confidence}]`;
      lines.push(`  - ${p.name}: ${p.description}${detail}`);
    }
  }

  // Other patterns
  if (other.length > 0) {
    if (stateManagement.length > 0 || dataLayer.length > 0 || uiLayer.length > 0) {
      lines.push('Other Patterns:');
    }
    for (const p of other) {
      const detail = p.confidence === 'observed' ? '' : ` [${p.confidence}]`;
      lines.push(`  - ${p.name}: ${p.description}${detail}`);
    }
  }

  return lines.join('\n');
}

export function explainAIConstraints(constraints: AIConstraints): string {
  const lines: string[] = [];

  if (constraints.architecture_rules.length > 0) {
    lines.push('Architecture rules:');
    constraints.architecture_rules.forEach(r => lines.push(`  ✓ ${r}`));
  }

  if (constraints.constraints.length > 0) {
    lines.push('Constraints (what NOT to do):');
    constraints.constraints.forEach(c => lines.push(`  ✗ ${c}`));
  }

  if (constraints.uncertain.length > 0) {
    lines.push('Needs confirmation:');
    constraints.uncertain.forEach(u => lines.push(`  ? ${u}`));
  }

  return lines.join('\n');
}
