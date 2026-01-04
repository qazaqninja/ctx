import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import type { FileEntry, Finding, Manifest, Conventions, Architecture, FullContext, StructurePattern, DependencyContext } from '../types/schema.js';
import type { Abstraction, LanguageFramework, FormattingStyle, ImportStyle, CodeNaming, DependencyContext as PatternDependencyContext } from './patterns.js';

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
  dependencyContext?: PatternDependencyContext | null;
}

interface InferredContext {
  manifest: Partial<Manifest>;
  conventions: Conventions;
  architecture: Architecture;
}

export function inferConventions(input: AnalysisInput): InferredContext {
  const { files, naming, structure, abstractions, langFramework, formatting, imports, codeNaming, monorepo, dependencyContext } = input;

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
      builtinPrefix: imports.builtinPrefix,
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

  // Detect Flutter state management pattern from abstractions
  const isDart = langFramework.language.value === 'dart';
  const isFlutter = langFramework.framework?.value?.includes('flutter') ?? false;

  if (isDart || isFlutter) {
    // Check for BLoC pattern
    const hasBloc = abstractions.some(a => a.name === 'bloc');
    const hasEvent = abstractions.some(a => a.name === 'event');
    const hasState = abstractions.some(a => a.name === 'state');
    const hasCubit = abstractions.some(a => a.name === 'cubit');

    if ((hasBloc && (hasEvent || hasState)) || (hasCubit && hasState)) {
      const blocCount = abstractions.find(a => a.name === 'bloc')?.count ?? 0;
      const cubitCount = abstractions.find(a => a.name === 'cubit')?.count ?? 0;
      const evidence = [];
      if (blocCount > 0) evidence.push(`${blocCount} BLoC files`);
      if (cubitCount > 0) evidence.push(`${cubitCount} Cubit files`);

      patterns.state_management = {
        value: 'BLoC pattern',
        confidence: 'observed',
        evidence,
      };
    }

    // Check for provider-based patterns (Riverpod/Provider)
    const hasProvider = abstractions.some(a => a.name === 'provider');
    if (hasProvider && !patterns.state_management) {
      const providerCount = abstractions.find(a => a.name === 'provider')?.count ?? 0;
      const frameworkValue = langFramework.framework?.value ?? '';

      if (frameworkValue.includes('Riverpod')) {
        patterns.state_management = {
          value: 'Riverpod pattern',
          confidence: 'observed',
          evidence: [`${providerCount} provider files`],
        };
      } else if (frameworkValue.includes('Provider')) {
        patterns.state_management = {
          value: 'Provider pattern',
          confidence: 'observed',
          evidence: [`${providerCount} provider files`],
        };
      }
    }

    // Check for GetX pattern
    const hasController = abstractions.some(a => a.name === 'controller');
    if (hasController && langFramework.framework?.value?.includes('GetX')) {
      const controllerCount = abstractions.find(a => a.name === 'controller')?.count ?? 0;
      patterns.state_management = {
        value: 'GetX pattern',
        confidence: 'observed',
        evidence: [`${controllerCount} controller files`],
      };
    }
  }

  // Flutter-specific responsibility descriptions
  const flutterResponsibilities: Record<string, string> = {
    bloc: 'BLoC state management - handles business logic and state transitions',
    cubit: 'Cubit state management - simplified BLoC for synchronous state changes',
    event: 'BLoC events - user actions and triggers that initiate state changes',
    state: 'BLoC/Cubit states - immutable snapshots of application state',
    provider: 'State providers - dependency injection and state sharing',
    controller: 'Controllers - business logic and state management (GetX/MVC)',
    service: 'Services - external API calls and business logic',
    repository: 'Repository layer - data access abstraction',
    model: 'Data models - domain entities and DTOs',
    entity: 'Domain entities - core business objects',
    datasource: 'Data sources - remote/local data access implementations',
    dto: 'Data transfer objects - API request/response models',
    page: 'Page widgets - full screen UI components',
    screen: 'Screen widgets - full screen UI components',
    widget: 'Reusable widgets - UI components',
    usecase: 'Use cases - application-specific business rules',
  };

  // Generic responsibility descriptions for non-Flutter
  const genericResponsibilities: Record<string, string> = {
    service: 'Service layer - business logic',
    repository: 'Repository layer - data access',
    controller: 'Controller layer - request handling',
    middleware: 'Middleware - request/response processing',
    handler: 'Handler layer - event/request handling',
    util: 'Utilities - helper functions',
    helper: 'Helpers - auxiliary functions',
    model: 'Model layer - data structures',
    entity: 'Entity layer - domain objects',
    dto: 'DTO layer - data transfer objects',
  };

  const boundaries = abstractions.map(a => {
    // Determine file pattern based on language
    const isTypescript = langFramework.language.value === 'typescript' || langFramework.language.value === 'javascript';
    const filePattern = isDart
      ? `**/*_${a.name}.dart`
      : isTypescript
        ? `**/*.${a.name}.{ts,js}`
        : `**/*.${a.name}.*`;

    // Get appropriate responsibility description
    const responsibility = (isDart || isFlutter)
      ? (flutterResponsibilities[a.name] ?? `${a.name} layer`)
      : (genericResponsibilities[a.name] ?? `${a.name} layer`);

    return {
      name: a.name,
      path: filePattern,
      responsibility,
      confidence: 'inferred' as const,
    };
  });

  const architecture: Architecture = {
    structure,
    boundaries,
    patterns,
    isMonorepo: monorepo,
    dependencies: dependencyContext ? {
      dependencies: dependencyContext.dependencies,
      devDependencies: dependencyContext.devDependencies,
      categories: dependencyContext.categories,
    } : undefined,
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
