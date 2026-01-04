/**
 * Template for Next.js apps
 */

export const frameworkId = 'nextjs';

export interface TemplateData {
  name: string;
  description: string;
  nextjs_version: string | null;
  uses_app_router: boolean;
  uses_typescript: boolean;
  pages_dir: string;
  components_dir: string | null;
  api_routes_dir: string | null;
  page_count: number;
  api_route_count: number;
  state_management: string | null;
  styling_solution: string;
  database_type: string | null;
  database_orm: string | null;
  auth_provider: string | null;
  key_dependencies: string[];
  uses_server_components: boolean;
  example_page: string;
  example_api_route: string | null;
}

export function render(data: TemplateData): string {
  const langNote = data.uses_typescript ? 'TypeScript' : 'JavaScript';
  const versionNote = data.nextjs_version ? ` ${data.nextjs_version}` : '';

  const routerType = data.uses_app_router ? 'App Router' : 'Pages Router';
  const serverComponentsNote = data.uses_server_components
    ? '  Server Components: Yes (default for app/ directory)'
    : '';

  const componentsDirSection = data.components_dir
    ? `Components: ${data.components_dir}`
    : 'Components: src/components/ or components/';

  const apiRoutesSection = data.api_routes_dir
    ? `API Routes: ${data.api_routes_dir} (${data.api_route_count} routes)`
    : data.uses_app_router
      ? 'API Routes: app/api/ (route handlers)'
      : 'API Routes: pages/api/';

  const stateSection = data.state_management
    ? `State Management: ${data.state_management}`
    : 'State Management: React state / Context';

  const databaseSection = data.database_type
    ? `Database: ${data.database_type}${data.database_orm ? ` (via ${data.database_orm})` : ''}`
    : 'Database: None detected';

  const authSection = data.auth_provider
    ? `Authentication: ${data.auth_provider}`
    : 'Authentication: None detected';

  const dependenciesSection = data.key_dependencies.length > 0
    ? data.key_dependencies.map(dep => `  - ${dep}`).join('\n')
    : '  - next\n  - react';

  const apiRouteExample = data.example_api_route
    ? `\n  API route example: ${data.example_api_route}`
    : '';

  const addPageInstructions = data.uses_app_router
    ? `Add New Page:
  1. Create ${data.pages_dir}{name}/page.tsx
  2. Export default component (Server Component by default)
  3. Add loading.tsx, error.tsx as needed
  4. For client interactivity, use 'use client' directive`
    : `Add New Page:
  1. Create ${data.pages_dir}{name}.tsx
  2. Export default component
  3. Use getServerSideProps/getStaticProps for data fetching`;

  const addApiInstructions = data.uses_app_router
    ? `Add New API Route:
  1. Create ${data.api_routes_dir || 'app/api/'}{name}/route.ts
  2. Export GET, POST, PUT, DELETE handlers
  3. Use NextRequest/NextResponse`
    : `Add New API Route:
  1. Create pages/api/{name}.ts
  2. Export default handler function
  3. Use req.method to handle different methods`;

  return `${data.name} - Next.js${versionNote} ${data.description} (${langNote})

Quick Start:
  Run: npm run dev
  Build: npm run build
  Test: npm test

Routing: ${routerType}
  Pages: ${data.pages_dir} (${data.page_count} pages)
${serverComponentsNote}

${componentsDirSection}
${apiRoutesSection}

Styling: ${data.styling_solution}
${stateSection}

${databaseSection}
${authSection}

Dependencies:
${dependenciesSection}

${addPageInstructions}

${addApiInstructions}

Examples:
  Page: ${data.example_page}${apiRouteExample}

Conventions:
  - Colocate components with their pages when page-specific
  - Use shared components in ${data.components_dir || 'components/'}
  - Keep API routes thin, delegate to services
  - Use environment variables for config (NEXT_PUBLIC_ for client)
`;
}
