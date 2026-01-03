import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import type { Manifest, Conventions, Architecture, FullContext, Finding } from '../types/schema.js';

export async function loadContext(ctxPath: string): Promise<FullContext> {
  const readYaml = <T>(name: string): T => {
    const filePath = path.join(ctxPath, name);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing ${name}`);
    }
    return YAML.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  };

  return {
    manifest: readYaml<Manifest>('manifest.yaml'),
    conventions: readYaml<Conventions>('conventions.yaml'),
    architecture: readYaml<Architecture>('architecture.yaml'),
    exclusions: readYaml<{ paths: string[] }>('exclusions.yaml'),
  };
}

export function explainArchitecture(arch: Architecture): string {
  const lines: string[] = [];

  if (arch.structure?.value) {
    const patterns: Record<string, string> = {
      'vertical-features': 'Vertical feature folders (domain-driven organization)',
      'layered': 'Layered architecture (controllers/services/repositories)',
      'modular': 'Modular structure (feature-based but less strict)',
      'flat': 'Flat structure (minimal nesting)',
    };
    lines.push(`- ${patterns[arch.structure.value] || arch.structure.value}`);
  }

  if (arch.patterns?.persistence?.value) {
    lines.push(`- ${capitalize(arch.patterns.persistence.value)} pattern for data access`);
  }

  if (arch.patterns?.error_handling?.value) {
    lines.push(`- ${arch.patterns.error_handling.value} for error handling`);
  }

  if (arch.boundaries && arch.boundaries.length > 0) {
    const layers = arch.boundaries.map(b => b.name).join(', ');
    lines.push(`- Clear abstractions: ${layers}`);
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
