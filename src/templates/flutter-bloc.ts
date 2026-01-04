/**
 * Template for Flutter apps using BLoC pattern
 */

export const frameworkId = 'flutter-bloc';

export interface TemplateData {
  name: string;
  description: string;
  entry_point: string;
  feature_dirs: string[];
  bloc_count: number;
  bloc_names: string[];
  uses_freezed: boolean;
  database_type: string | null;
  database_info: string | null;
  key_dependencies: string[];
  example_feature: string;
  bloc_registration_file: string;
  router_file: string;
}

export function render(data: TemplateData): string {
  const featureDirsSection = data.feature_dirs.length > 0
    ? data.feature_dirs.map(dir => `  ${dir}`).join('\n')
    : '  lib/src/features/';

  const blocNamesSection = data.bloc_names.length > 0
    ? data.bloc_names.join(', ')
    : 'none detected';

  const freezedNote = data.uses_freezed
    ? '(using Freezed for immutable states)'
    : '';

  const databaseSection = data.database_type
    ? `Database: ${data.database_type}\n  ${data.database_info || 'No additional database info'}`
    : 'Database: None detected';

  const dependenciesSection = data.key_dependencies.length > 0
    ? data.key_dependencies.map(dep => `  - ${dep}`).join('\n')
    : '  - flutter_bloc\n  - equatable';

  return `${data.name} - Flutter ${data.description} (BLoC architecture)

Quick Start:
  Entry point: ${data.entry_point}
  Run: flutter run
  Test: flutter test

Architecture:
${featureDirsSection}
  Each feature has: domain/ -> data/ -> presentation/

State Management: BLoC
  ${data.bloc_count} BLoCs: ${blocNamesSection}
  Pattern: events -> bloc -> states ${freezedNote}

${databaseSection}

Dependencies:
${dependenciesSection}

Add New Feature:
  1. Create lib/src/features/{name}/
  2. Copy structure from ${data.example_feature}/ feature
  3. Register BLoC in ${data.bloc_registration_file}
  4. Add routes in ${data.router_file}

Code Generation:
  After changing models: dart run build_runner build
`;
}
