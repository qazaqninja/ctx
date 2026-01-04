/**
 * Template for Flutter apps using Riverpod pattern
 */

export const frameworkId = 'flutter-riverpod';

export interface TemplateData {
  name: string;
  description: string;
  entry_point: string;
  feature_dirs: string[];
  provider_count: number;
  provider_names: string[];
  uses_riverpod_generator: boolean;
  uses_freezed: boolean;
  database_type: string | null;
  database_info: string | null;
  key_dependencies: string[];
  example_feature: string;
  providers_file: string;
  router_file: string;
}

export function render(data: TemplateData): string {
  const featureDirsSection = data.feature_dirs.length > 0
    ? data.feature_dirs.map(dir => `  ${dir}`).join('\n')
    : '  lib/src/features/';

  const providerNamesSection = data.provider_names.length > 0
    ? data.provider_names.join(', ')
    : 'none detected';

  const generatorNote = data.uses_riverpod_generator
    ? '(using riverpod_generator for code generation)'
    : '';

  const freezedNote = data.uses_freezed
    ? ', Freezed for immutable states'
    : '';

  const databaseSection = data.database_type
    ? `Database: ${data.database_type}\n  ${data.database_info || 'No additional database info'}`
    : 'Database: None detected';

  const dependenciesSection = data.key_dependencies.length > 0
    ? data.key_dependencies.map(dep => `  - ${dep}`).join('\n')
    : '  - flutter_riverpod\n  - riverpod_annotation';

  return `${data.name} - Flutter ${data.description} (Riverpod architecture)

Quick Start:
  Entry point: ${data.entry_point}
  Run: flutter run
  Test: flutter test

Architecture:
${featureDirsSection}
  Each feature has: domain/ -> data/ -> presentation/

State Management: Riverpod
  ${data.provider_count} Providers: ${providerNamesSection}
  Pattern: providers -> notifiers -> states ${generatorNote}${freezedNote}

${databaseSection}

Dependencies:
${dependenciesSection}

Add New Feature:
  1. Create lib/src/features/{name}/
  2. Copy structure from ${data.example_feature}/ feature
  3. Add providers in ${data.providers_file}
  4. Add routes in ${data.router_file}

Code Generation:
  After changing models/providers: dart run build_runner build
`;
}
