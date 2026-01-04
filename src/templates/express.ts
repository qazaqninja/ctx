/**
 * Template for Express.js apps
 */

export const frameworkId = 'express';

export interface TemplateData {
  name: string;
  description: string;
  entry_point: string;
  uses_typescript: boolean;
  structure_pattern: 'layered' | 'vertical-features' | 'modular' | 'flat';
  route_dirs: string[];
  middleware_dir: string | null;
  controller_count: number;
  service_count: number;
  repository_count: number;
  database_type: string | null;
  database_orm: string | null;
  error_handling_style: string;
  auth_type: string | null;
  key_dependencies: string[];
  test_framework: string | null;
  example_route: string;
  example_controller: string | null;
}

export function render(data: TemplateData): string {
  const langNote = data.uses_typescript ? 'TypeScript' : 'JavaScript';

  const structureDescriptions: Record<string, string> = {
    'layered': 'Layered (controllers -> services -> repositories)',
    'vertical-features': 'Vertical features (domain-driven)',
    'modular': 'Modular (feature-based)',
    'flat': 'Flat (minimal structure)',
  };

  const routeDirsSection = data.route_dirs.length > 0
    ? data.route_dirs.map(dir => `  ${dir}`).join('\n')
    : '  src/routes/';

  const middlewareSection = data.middleware_dir
    ? `Middleware: ${data.middleware_dir}`
    : 'Middleware: src/middleware/ (or inline)';

  const layersSection = [
    data.controller_count > 0 ? `${data.controller_count} controllers` : null,
    data.service_count > 0 ? `${data.service_count} services` : null,
    data.repository_count > 0 ? `${data.repository_count} repositories` : null,
  ].filter(Boolean).join(', ') || 'No layered abstractions detected';

  const databaseSection = data.database_type
    ? `Database: ${data.database_type}${data.database_orm ? ` (via ${data.database_orm})` : ''}`
    : 'Database: None detected';

  const authSection = data.auth_type
    ? `Authentication: ${data.auth_type}`
    : 'Authentication: None detected';

  const dependenciesSection = data.key_dependencies.length > 0
    ? data.key_dependencies.map(dep => `  - ${dep}`).join('\n')
    : '  - express';

  const testSection = data.test_framework
    ? `Test: npm test (${data.test_framework})`
    : 'Test: npm test';

  const exampleControllerNote = data.example_controller
    ? `  See ${data.example_controller} for controller pattern`
    : '';

  return `${data.name} - Express.js ${data.description} (${langNote})

Quick Start:
  Entry point: ${data.entry_point}
  Run: npm start (or npm run dev)
  ${testSection}

Architecture: ${structureDescriptions[data.structure_pattern] || data.structure_pattern}

Routes:
${routeDirsSection}

${middlewareSection}

Layers: ${layersSection}

${databaseSection}
${authSection}

Error Handling: ${data.error_handling_style}

Dependencies:
${dependenciesSection}

Add New Route:
  1. Create route file following ${data.example_route}
${exampleControllerNote}
  2. Register in main router/app
  3. Add middleware as needed

Conventions:
  - Use async/await with try-catch or error middleware
  - Validate input at route level
  - Keep business logic in services
`;
}
