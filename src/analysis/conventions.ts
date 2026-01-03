import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import type { FileEntry, Finding, Manifest, Conventions, Architecture, FullContext, StructurePattern } from '../types/schema.js';
import type { Abstraction, LanguageFramework, FormattingStyle, ImportStyle, CodeNaming } from './patterns.js';

type NamingStyle = 'kebab-case' | 'snake_case' | 'camelCase' | 'PascalCase' | 'mixed';

interface AnalysisInput {
  files: FileEntry[];
  naming: Finding<NamingStyle>;
  structure: Finding<StructurePattern>;
  abstractions: Abstraction[];
  langFramework: LanguageFramework;
  formatting: FormattingStyle;
  imports: ImportStyle;
  codeNaming: CodeNaming;
  monorepo: Finding<boolean>;
}

interface InferredContext {
  manifest: Partial<Manifest>;
  conventions: Conventions;
  architecture: Architecture;
}

export function inferConventions(input: AnalysisInput): InferredContext {
  const { files, naming, structure, abstractions, langFramework, formatting, imports, codeNaming, monorepo } = input;

  const manifest: Partial<Manifest> = {
    name: path.basename(process.cwd()),
    language: langFramework.language,
    framework: langFramework.framework,
    generated_at: new Date().toISOString(),
    ctx_version: '0.1.0',
    isMonorepo: monorepo.value ? monorepo : undefined,
  };

  const conventions: Conventions = {
    naming: {
      files: naming,
      functions: codeNaming.functions,
      classes: codeNaming.classes,
    },
    formatting: {
      indent: formatting.indent,
      quotes: formatting.quotes as Finding<string>,
      semicolons: formatting.semicolons,
    },
    imports: {
      style: imports.style as Finding<string>,
      nodePrefix: imports.nodePrefix,
    },
  };

  const patterns: Architecture['patterns'] = {};

  const hasRepos = abstractions.some(a => a.name === 'repository');
  if (hasRepos) {
    patterns.persistence = {
      value: 'repository',
      confidence: 'inferred',
      evidence: [`Found ${abstractions.find(a => a.name === 'repository')?.count} repository files`],
    };
  }

  const boundaries = abstractions.map(a => ({
    name: a.name,
    path: `**/*.${a.name}.*`,
    responsibility: `${a.name} layer`,
    confidence: 'inferred' as const,
  }));

  const architecture: Architecture = {
    structure,
    boundaries,
    patterns,
    isMonorepo: monorepo,
  };

  return { manifest, conventions, architecture };
}

export async function writeContextFiles(ctxPath: string, context: InferredContext): Promise<void> {
  const files = [
    { name: 'manifest.yaml', content: context.manifest },
    { name: 'conventions.yaml', content: context.conventions },
    { name: 'architecture.yaml', content: context.architecture },
  ];

  for (const file of files) {
    const filePath = path.join(ctxPath, file.name);
    fs.writeFileSync(filePath, YAML.stringify(file.content));
  }
}
