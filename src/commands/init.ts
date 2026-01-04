import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import type { Manifest, Conventions, Architecture, Exclusions } from '../types/schema.js';

const CTX_DIR = '.ctx';

const defaultManifest: Partial<Manifest> = {
  name: '',
  language: { value: '', confidence: 'uncertain' },
  description: '',
  generated_at: '',
  ctx_version: '0.1.0',
};

const defaultConventions: Conventions = {
  naming: {
    files: { value: '', confidence: 'uncertain' },
    functions: { value: '', confidence: 'uncertain' },
    classes: { value: '', confidence: 'uncertain' },
  },
  formatting: {
    indent: { value: '', confidence: 'uncertain' },
    quotes: { value: '', confidence: 'uncertain' },
    semicolons: { value: false, confidence: 'uncertain' },
  },
  imports: {
    style: { value: '', confidence: 'uncertain' },
    order: { value: [], confidence: 'uncertain' },
  },
  comments: {
    jsdoc: { value: '', confidence: 'uncertain' },
    inline: { value: '', confidence: 'uncertain' },
  },
};

const defaultArchitecture: Architecture = {
  structure: { value: 'flat', confidence: 'uncertain' },
  boundaries: [],
  patterns: {
    persistence: { value: '', confidence: 'uncertain' },
    error_handling: { value: '', confidence: 'uncertain' },
    dependency_injection: { value: '', confidence: 'uncertain' },
  },
  data_flow: { value: '', confidence: 'uncertain' },
};

const defaultExclusions: Exclusions = {
  paths: [
    // JavaScript/TypeScript
    'node_modules',
    'dist',
    'build',
    '.git',
    '*.test.ts',
    '*.spec.ts',
    '__mocks__',
    '__tests__',
    'coverage',
    '.next',
    '.nuxt',
    // Dart/Flutter
    '.dart_tool',
    '.flutter-plugins',
    '.flutter-plugins-dependencies',
    '*.g.dart',
    '*.freezed.dart',
    '*.gr.dart',
    '*.config.dart',
    '*.mocks.dart',
  ],
  ignore_patterns: [
    'generated files',
    'vendored code',
  ],
};

export async function init(): Promise<void> {
  const ctxPath = path.join(process.cwd(), CTX_DIR);

  if (fs.existsSync(ctxPath)) {
    console.error(`Error: ${CTX_DIR}/ already exists. Remove it first to reinitialize.`);
    process.exit(1);
  }

  fs.mkdirSync(ctxPath, { recursive: true });

  const files = [
    { name: 'manifest.yaml', content: defaultManifest },
    { name: 'conventions.yaml', content: defaultConventions },
    { name: 'architecture.yaml', content: defaultArchitecture },
    { name: 'exclusions.yaml', content: defaultExclusions },
  ];

  for (const file of files) {
    const filePath = path.join(ctxPath, file.name);
    fs.writeFileSync(filePath, YAML.stringify(file.content));
  }

  console.log(`Created ${CTX_DIR}/ directory with:`);
  files.forEach(f => console.log(`  - ${f.name}`));
  console.log('\nRun "ctx scan" to analyze your codebase.');
}
