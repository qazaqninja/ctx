/**
 * Project Parser - Extracts real data from the codebase for template rendering
 *
 * This parser extracts data that matches the specific TemplateData interfaces
 * defined in each framework template (flutter-bloc.ts, flutter-riverpod.ts, etc.)
 */

import fs from 'fs';
import path from 'path';
import type { ExtendedContext } from '../synthesis/explainer.js';
import type { TemplateData as FlutterBlocData } from './flutter-bloc.js';
import type { TemplateData as FlutterRiverpodData } from './flutter-riverpod.js';
import type { TemplateData as ExpressData } from './express.js';
import type { TemplateData as NextjsData } from './nextjs.js';
import type { FrameworkId } from './index.js';

// Re-export types for internal use
export type { FlutterBlocData, FlutterRiverpodData, ExpressData, NextjsData };

// Union type for any template data
export type AnyTemplateData = FlutterBlocData | FlutterRiverpodData | ExpressData | NextjsData;

/**
 * Parse a project and extract data for template rendering based on framework
 */
export async function parseProjectForFramework(
  projectPath: string,
  context: ExtendedContext,
  frameworkId: FrameworkId
): Promise<AnyTemplateData> {
  switch (frameworkId) {
    case 'flutter-bloc':
      return parseFlutterBlocProject(projectPath, context);
    case 'flutter-riverpod':
      return parseFlutterRiverpodProject(projectPath, context);
    case 'express':
      return parseExpressProject(projectPath, context);
    case 'nextjs':
      return parseNextjsProject(projectPath, context);
    default:
      throw new Error(`Unknown framework: ${frameworkId}`);
  }
}

// ============================================================================
// Flutter BLoC Parser
// ============================================================================

async function parseFlutterBlocProject(
  projectPath: string,
  context: ExtendedContext
): Promise<FlutterBlocData> {
  const libPath = path.join(projectPath, 'lib');

  // Find BLoC files
  const blocFiles: { name: string; path: string }[] = [];
  if (fs.existsSync(libPath)) {
    await findFilesRecursively(libPath, libPath, blocFiles, /_bloc\.dart$|_cubit\.dart$/);
  }

  // Find feature directories
  const featureDirs = findFeatureDirectories(projectPath);

  // Extract key dependencies from pubspec.yaml directly
  const keyDeps = extractDependenciesFromPubspec(projectPath);

  // Check for freezed usage
  const usesFreezed = keyDeps.some(d => d.includes('freezed'));

  // Detect database from pubspec.yaml directly
  const { databaseType, databaseInfo } = detectDatabaseFromPubspec(projectPath);

  // Find example feature
  const exampleFeature = featureDirs.length > 0
    ? path.basename(featureDirs[0].replace(/\/$/, ''))
    : 'example';

  // Find entry points (main*.dart files)
  const entryPoint = findEntryPoint(projectPath);

  // Find registration file by searching for MultiBlocProvider or @injectable
  const blocRegistrationFile = findFileWithContent(projectPath, 'lib', [
    'MultiBlocProvider',
    '@InjectableInit',
    'GetIt.instance',
    'getIt.registerSingleton',
  ]) || findBlocRegistrationFile(projectPath);

  // Find router file - prefer route definition files over usage files
  // Search in common router locations first
  const routerFile = findFileWithContent(projectPath, 'lib/src/core/router', [
    'GoRouter(',
  ]) || findFileWithContent(projectPath, 'lib/src/router', [
    'GoRouter(',
  ]) || findFileWithContent(projectPath, 'lib/router', [
    'GoRouter(',
  ]) || findFileWithContent(projectPath, 'lib', [
    '@MaterialAutoRouter',
    'AutoRoute(',
  ]) || findRouterFile(projectPath);

  return {
    name: context.manifest.name,
    description: context.manifest.description || 'application',
    entry_point: entryPoint,
    feature_dirs: featureDirs,
    bloc_count: blocFiles.length,
    bloc_names: blocFiles.map(b => toPascalCase(b.name.replace(/_bloc\.dart$|_cubit\.dart$/, ''))),
    uses_freezed: usesFreezed,
    database_type: databaseType,
    database_info: databaseInfo,
    key_dependencies: keyDeps,
    example_feature: exampleFeature,
    bloc_registration_file: blocRegistrationFile,
    router_file: routerFile,
  };
}

// ============================================================================
// Flutter Riverpod Parser
// ============================================================================

async function parseFlutterRiverpodProject(
  projectPath: string,
  context: ExtendedContext
): Promise<FlutterRiverpodData> {
  const libPath = path.join(projectPath, 'lib');

  // Find provider files
  const providerFiles: { name: string; path: string }[] = [];
  if (fs.existsSync(libPath)) {
    await findFilesRecursively(libPath, libPath, providerFiles, /_provider\.dart$|_providers\.dart$/);
  }

  // Find feature directories
  const featureDirs = findFeatureDirectories(projectPath);

  // Extract key dependencies from pubspec.yaml directly
  const keyDeps = extractDependenciesFromPubspec(projectPath);

  // Check for riverpod generator and freezed usage
  const usesRiverpodGenerator = keyDeps.includes('riverpod_generator');
  const usesFreezed = keyDeps.includes('freezed');

  // Detect database from pubspec.yaml directly
  const { databaseType, databaseInfo } = detectDatabaseFromPubspec(projectPath);

  // Find example feature
  const exampleFeature = featureDirs.length > 0
    ? path.basename(featureDirs[0].replace(/\/$/, ''))
    : 'example';

  // Find entry point
  const entryPoint = findEntryPoint(projectPath);

  // Find providers file by searching for ProviderScope or @riverpod
  const providersFile = findFileWithContent(projectPath, 'lib', [
    'ProviderScope(',
    '@riverpod',
    'final.*Provider',
  ]) || findProvidersFile(projectPath);

  // Find router file - prefer route definition files over usage files
  const routerFile = findFileWithContent(projectPath, 'lib/src/core/router', [
    'GoRouter(',
  ]) || findFileWithContent(projectPath, 'lib/src/router', [
    'GoRouter(',
  ]) || findFileWithContent(projectPath, 'lib/router', [
    'GoRouter(',
  ]) || findFileWithContent(projectPath, 'lib', [
    '@MaterialAutoRouter',
    'AutoRoute(',
  ]) || findRouterFile(projectPath);

  return {
    name: context.manifest.name,
    description: context.manifest.description || 'application',
    entry_point: entryPoint,
    feature_dirs: featureDirs,
    provider_count: providerFiles.length,
    provider_names: providerFiles.map(p => toPascalCase(p.name.replace(/_provider\.dart$|_providers\.dart$/, ''))),
    uses_riverpod_generator: usesRiverpodGenerator,
    uses_freezed: usesFreezed,
    database_type: databaseType,
    database_info: databaseInfo,
    key_dependencies: keyDeps,
    example_feature: exampleFeature,
    providers_file: providersFile,
    router_file: routerFile,
  };
}

// ============================================================================
// Express Parser
// ============================================================================

async function parseExpressProject(
  projectPath: string,
  context: ExtendedContext
): Promise<ExpressData> {
  const srcPath = path.join(projectPath, 'src');
  const basePath = fs.existsSync(srcPath) ? srcPath : projectPath;

  // Detect TypeScript usage
  const usesTypescript = fs.existsSync(path.join(projectPath, 'tsconfig.json'));

  // Find route directories
  const routeDirs = findRouteDirs(basePath);

  // Find middleware directory
  const middlewareDir = findMiddlewareDir(basePath);

  // Count layers
  const controllerCount = await countFilesWithPattern(basePath, /controller\.(ts|js)$/);
  const serviceCount = await countFilesWithPattern(basePath, /service\.(ts|js)$/);
  const repositoryCount = await countFilesWithPattern(basePath, /repository\.(ts|js)$/);

  // Detect database and ORM
  const { databaseType, databaseInfo } = detectDatabase(context);

  // Error handling style
  const errorHandlingStyle = context.architecture.patterns?.error_handling?.value || 'try-catch';

  // Detect auth
  const authType = detectAuthType(context);

  // Extract key dependencies
  const keyDeps = extractKeyDependencies(context);

  // Detect test framework
  const testFramework = detectTestFramework(context);

  // Find example files
  const exampleRoute = findExampleFile(basePath, /route\.(ts|js)$/) || 'src/routes/example.ts';
  const exampleController = findExampleFile(basePath, /controller\.(ts|js)$/);

  return {
    name: context.manifest.name,
    description: context.manifest.description || 'API',
    entry_point: usesTypescript ? 'src/index.ts' : 'src/index.js',
    uses_typescript: usesTypescript,
    structure_pattern: context.architecture.structure?.value || 'layered',
    route_dirs: routeDirs,
    middleware_dir: middlewareDir,
    controller_count: controllerCount,
    service_count: serviceCount,
    repository_count: repositoryCount,
    database_type: databaseType,
    database_orm: databaseInfo,
    error_handling_style: errorHandlingStyle,
    auth_type: authType,
    key_dependencies: keyDeps,
    test_framework: testFramework,
    example_route: exampleRoute,
    example_controller: exampleController,
  };
}

// ============================================================================
// Next.js Parser
// ============================================================================

async function parseNextjsProject(
  projectPath: string,
  context: ExtendedContext
): Promise<NextjsData> {
  // Detect TypeScript usage
  const usesTypescript = fs.existsSync(path.join(projectPath, 'tsconfig.json'));

  // Detect router type
  const appPath = path.join(projectPath, 'app');
  const srcAppPath = path.join(projectPath, 'src', 'app');
  const pagesPath = path.join(projectPath, 'pages');
  const srcPagesPath = path.join(projectPath, 'src', 'pages');

  const usesAppRouter = fs.existsSync(appPath) || fs.existsSync(srcAppPath);
  const pagesDir = usesAppRouter
    ? (fs.existsSync(srcAppPath) ? 'src/app/' : 'app/')
    : (fs.existsSync(srcPagesPath) ? 'src/pages/' : 'pages/');

  // Find components directory
  const componentsDirCandidates = [
    'src/components',
    'components',
    'src/app/components',
    'app/components',
  ];
  const componentsDir = componentsDirCandidates.find(d => fs.existsSync(path.join(projectPath, d))) || null;

  // Find API routes directory
  const apiRoutesDirCandidates = usesAppRouter
    ? ['src/app/api', 'app/api']
    : ['src/pages/api', 'pages/api'];
  const apiRoutesDir = apiRoutesDirCandidates.find(d => fs.existsSync(path.join(projectPath, d))) || null;

  // Count pages and API routes
  const basePagesPath = usesAppRouter
    ? (fs.existsSync(srcAppPath) ? srcAppPath : appPath)
    : (fs.existsSync(srcPagesPath) ? srcPagesPath : pagesPath);

  const pageCount = fs.existsSync(basePagesPath)
    ? await countFilesWithPattern(basePagesPath, usesAppRouter ? /page\.(tsx|ts|jsx|js)$/ : /\.(tsx|ts|jsx|js)$/)
    : 0;

  const apiRouteCount = apiRoutesDir
    ? await countFilesWithPattern(path.join(projectPath, apiRoutesDir), usesAppRouter ? /route\.(ts|js)$/ : /\.(ts|js)$/)
    : 0;

  // Detect state management
  const stateManagement = detectStateManagement(context);

  // Detect styling solution
  const stylingSolution = detectStylingSolution(projectPath, context);

  // Detect database and ORM
  const { databaseType, databaseInfo } = detectDatabase(context);

  // Detect auth provider
  const authProvider = detectAuthProvider(context);

  // Extract key dependencies
  const keyDeps = extractKeyDependencies(context);

  // Detect Next.js version
  const nextjsVersion = detectNextjsVersion(projectPath);

  // Find example files
  const examplePage = findExampleFile(
    basePagesPath,
    usesAppRouter ? /page\.(tsx|ts|jsx|js)$/ : /\.(tsx|ts|jsx|js)$/
  ) || (usesAppRouter ? 'app/page.tsx' : 'pages/index.tsx');

  const exampleApiRoute = apiRoutesDir
    ? findExampleFile(path.join(projectPath, apiRoutesDir), usesAppRouter ? /route\.(ts|js)$/ : /\.(ts|js)$/)
    : null;

  return {
    name: context.manifest.name,
    description: context.manifest.description || 'application',
    nextjs_version: nextjsVersion,
    uses_app_router: usesAppRouter,
    uses_typescript: usesTypescript,
    pages_dir: pagesDir,
    components_dir: componentsDir,
    api_routes_dir: apiRoutesDir,
    page_count: pageCount,
    api_route_count: apiRouteCount,
    state_management: stateManagement,
    styling_solution: stylingSolution,
    database_type: databaseType,
    database_orm: databaseInfo,
    auth_provider: authProvider,
    key_dependencies: keyDeps,
    uses_server_components: usesAppRouter,
    example_page: examplePage,
    example_api_route: exampleApiRoute,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

async function findFilesRecursively(
  dir: string,
  basePath: string,
  results: { name: string; path: string }[],
  pattern: RegExp
): Promise<void> {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const skipDirs = ['build', '.dart_tool', '.idea', 'test', 'node_modules', '.git', 'dist'];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!skipDirs.includes(entry.name)) {
        await findFilesRecursively(fullPath, basePath, results, pattern);
      }
    } else if (pattern.test(entry.name)) {
      results.push({
        name: entry.name,
        path: path.relative(basePath, fullPath),
      });
    }
  }
}

async function countFilesWithPattern(dir: string, pattern: RegExp): Promise<number> {
  const files: { name: string; path: string }[] = [];
  await findFilesRecursively(dir, dir, files, pattern);
  return files.length;
}

function findFeatureDirectories(projectPath: string): string[] {
  const featureDirs: string[] = [];
  const candidates = [
    'lib/features',
    'lib/src/features',
    'lib/modules',
    'lib/src/modules',
  ];

  for (const candidate of candidates) {
    const fullPath = path.join(projectPath, candidate);
    if (fs.existsSync(fullPath)) {
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          featureDirs.push(`${candidate}/${entry.name}/`);
        }
      }
      break;
    }
  }

  return featureDirs;
}

function findRouteDirs(basePath: string): string[] {
  const routeDirs: string[] = [];
  const candidates = ['routes', 'api', 'controllers', 'features'];

  for (const candidate of candidates) {
    const fullPath = path.join(basePath, candidate);
    if (fs.existsSync(fullPath)) {
      routeDirs.push(`src/${candidate}/`);
    }
  }

  return routeDirs.length > 0 ? routeDirs : ['src/routes/'];
}

function findMiddlewareDir(basePath: string): string | null {
  const candidates = ['middleware', 'middlewares'];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(basePath, candidate))) {
      return `src/${candidate}/`;
    }
  }
  return null;
}

function extractKeyDependencies(context: ExtendedContext): string[] {
  const deps: string[] = [];
  const categories = context.architecture.dependencies?.categories;

  if (categories) {
    if (categories.stateManagement) deps.push(...categories.stateManagement);
    if (categories.database) deps.push(...categories.database);
    if (categories.codeGeneration) deps.push(...categories.codeGeneration);
    if (categories.routing) deps.push(...categories.routing);
    if (categories.networking) deps.push(...categories.networking);
  }

  // Also get from dependencies list if available
  if (context.architecture.dependencies?.dependencies) {
    const mainDeps = context.architecture.dependencies.dependencies
      .filter(d => d.confidence !== 'uncertain')
      .map(d => d.name)
      .slice(0, 10); // Limit to top 10
    deps.push(...mainDeps);
  }

  // Remove duplicates
  return [...new Set(deps)];
}

function detectDatabase(context: ExtendedContext): { databaseType: string | null; databaseInfo: string | null } {
  const dbDeps = context.architecture.dependencies?.categories?.database || [];

  if (dbDeps.some(d => d.includes('drift') || d.includes('floor'))) {
    return { databaseType: 'SQLite', databaseInfo: dbDeps.find(d => d.includes('drift') || d.includes('floor')) || null };
  }
  if (dbDeps.some(d => d.includes('hive'))) {
    return { databaseType: 'Hive (NoSQL)', databaseInfo: 'hive' };
  }
  if (dbDeps.some(d => d.includes('isar'))) {
    return { databaseType: 'Isar (NoSQL)', databaseInfo: 'isar' };
  }
  if (dbDeps.some(d => d.includes('prisma'))) {
    return { databaseType: 'Database', databaseInfo: 'Prisma' };
  }
  if (dbDeps.some(d => d.includes('typeorm'))) {
    return { databaseType: 'Database', databaseInfo: 'TypeORM' };
  }
  if (dbDeps.some(d => d.includes('drizzle'))) {
    return { databaseType: 'Database', databaseInfo: 'Drizzle' };
  }
  if (dbDeps.some(d => d.includes('mongoose'))) {
    return { databaseType: 'MongoDB', databaseInfo: 'Mongoose' };
  }
  if (dbDeps.some(d => d.includes('pg') || d.includes('postgres'))) {
    return { databaseType: 'PostgreSQL', databaseInfo: null };
  }

  return { databaseType: null, databaseInfo: null };
}

function findBlocRegistrationFile(projectPath: string): string {
  const candidates = [
    'lib/injection.dart',
    'lib/di.dart',
    'lib/core/injection.dart',
    'lib/core/di.dart',
    'lib/src/injection.dart',
    'lib/src/di.dart',
    'lib/app.dart',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(projectPath, candidate))) {
      return candidate;
    }
  }
  return 'lib/injection.dart';
}

function findProvidersFile(projectPath: string): string {
  const candidates = [
    'lib/providers.dart',
    'lib/core/providers.dart',
    'lib/src/providers.dart',
    'lib/app/providers.dart',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(projectPath, candidate))) {
      return candidate;
    }
  }
  return 'lib/providers.dart';
}

function findRouterFile(projectPath: string): string {
  const candidates = [
    'lib/router.dart',
    'lib/routes.dart',
    'lib/app_router.dart',
    'lib/core/router.dart',
    'lib/core/routes.dart',
    'lib/src/router.dart',
    'lib/src/routes.dart',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(projectPath, candidate))) {
      return candidate;
    }
  }
  return 'lib/router.dart';
}

function detectAuthType(context: ExtendedContext): string | null {
  const deps = extractKeyDependencies(context);

  if (deps.some(d => d.includes('passport'))) return 'Passport.js';
  if (deps.some(d => d.includes('jsonwebtoken') || d.includes('jwt'))) return 'JWT';
  if (deps.some(d => d.includes('next-auth'))) return 'NextAuth.js';
  if (deps.some(d => d.includes('firebase-auth'))) return 'Firebase Auth';

  return null;
}

function detectAuthProvider(context: ExtendedContext): string | null {
  const deps = extractKeyDependencies(context);

  if (deps.some(d => d.includes('next-auth'))) return 'NextAuth.js';
  if (deps.some(d => d.includes('clerk'))) return 'Clerk';
  if (deps.some(d => d.includes('supabase'))) return 'Supabase Auth';
  if (deps.some(d => d.includes('firebase'))) return 'Firebase Auth';
  if (deps.some(d => d.includes('auth0'))) return 'Auth0';

  return null;
}

function detectTestFramework(context: ExtendedContext): string | null {
  const deps = extractKeyDependencies(context);

  if (deps.some(d => d.includes('jest'))) return 'Jest';
  if (deps.some(d => d.includes('vitest'))) return 'Vitest';
  if (deps.some(d => d.includes('mocha'))) return 'Mocha';

  return null;
}

function detectStateManagement(context: ExtendedContext): string | null {
  const deps = extractKeyDependencies(context);

  if (deps.some(d => d.includes('zustand'))) return 'Zustand';
  if (deps.some(d => d.includes('jotai'))) return 'Jotai';
  if (deps.some(d => d.includes('recoil'))) return 'Recoil';
  if (deps.some(d => d.includes('redux'))) return 'Redux';
  if (deps.some(d => d.includes('mobx'))) return 'MobX';

  return null;
}

function detectStylingSolution(projectPath: string, context: ExtendedContext): string {
  const deps = extractKeyDependencies(context);

  if (deps.some(d => d.includes('tailwind'))) return 'Tailwind CSS';
  if (deps.some(d => d.includes('styled-components'))) return 'styled-components';
  if (deps.some(d => d.includes('emotion'))) return '@emotion';
  if (deps.some(d => d.includes('sass') || d.includes('scss'))) return 'Sass/SCSS';
  if (fs.existsSync(path.join(projectPath, 'tailwind.config.js')) ||
      fs.existsSync(path.join(projectPath, 'tailwind.config.ts'))) {
    return 'Tailwind CSS';
  }

  return 'CSS Modules';
}

function detectNextjsVersion(projectPath: string): string | null {
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const nextVersion = packageJson.dependencies?.next || packageJson.devDependencies?.next;
      if (nextVersion) {
        return nextVersion.replace('^', '').replace('~', '');
      }
    } catch {
      // Ignore parse errors
    }
  }
  return null;
}

function findExampleFile(dir: string, pattern: RegExp): string | null {
  if (!fs.existsSync(dir)) return null;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() && pattern.test(entry.name)) {
        return path.join(dir, entry.name);
      }
    }
    // Check subdirectories
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_')) {
        const result = findExampleFile(path.join(dir, entry.name), pattern);
        if (result) return result;
      }
    }
  } catch {
    // Ignore errors
  }

  return null;
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

// ============================================================================
// Deterministic Helper Functions (read files directly, no guessing)
// ============================================================================

/**
 * Extract dependencies directly from pubspec.yaml
 */
function extractDependenciesFromPubspec(projectPath: string): string[] {
  const pubspecPath = path.join(projectPath, 'pubspec.yaml');
  if (!fs.existsSync(pubspecPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(pubspecPath, 'utf-8');
    const deps: string[] = [];

    // Simple YAML parsing for dependencies section
    const lines = content.split('\n');
    let inDependencies = false;
    let inDevDependencies = false;
    let baseIndent = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      // Track which section we're in
      if (trimmed === 'dependencies:') {
        inDependencies = true;
        inDevDependencies = false;
        baseIndent = line.search(/\S/);
        continue;
      }
      if (trimmed === 'dev_dependencies:') {
        inDependencies = false;
        inDevDependencies = true;
        baseIndent = line.search(/\S/);
        continue;
      }

      // Exit section if we hit another top-level key
      if (trimmed && !trimmed.startsWith('#') && line.search(/\S/) <= baseIndent && (inDependencies || inDevDependencies)) {
        if (!trimmed.startsWith('-') && trimmed.includes(':') && !trimmed.startsWith('sdk:') && !trimmed.startsWith('git:') && !trimmed.startsWith('path:')) {
          inDependencies = false;
          inDevDependencies = false;
        }
      }

      // Parse dependency names
      if ((inDependencies || inDevDependencies) && trimmed && !trimmed.startsWith('#')) {
        // Match: "  package_name: ^1.0.0" or "  package_name:"
        const match = trimmed.match(/^([a-z_][a-z0-9_]*)\s*:/);
        if (match) {
          const depName = match[1];
          // Skip "sdk" as it's always a special key (sdk: flutter)
          // Don't skip "path" as it's a legitimate Dart package
          if (depName !== 'sdk') {
            deps.push(depName);
          }
        }
      }
    }

    return deps;
  } catch {
    return [];
  }
}

/**
 * Detect database from pubspec.yaml directly
 */
function detectDatabaseFromPubspec(projectPath: string): { databaseType: string | null; databaseInfo: string | null } {
  const deps = extractDependenciesFromPubspec(projectPath);

  // Check for specific database packages
  if (deps.includes('drift') || deps.includes('drift_flutter')) {
    return { databaseType: 'SQLite (Drift)', databaseInfo: 'drift' };
  }
  if (deps.includes('floor')) {
    return { databaseType: 'SQLite (Floor)', databaseInfo: 'floor' };
  }
  if (deps.includes('sqflite') || deps.includes('sqflite_common')) {
    return { databaseType: 'SQLite (sqflite)', databaseInfo: 'sqflite' };
  }
  if (deps.includes('hive') || deps.includes('hive_flutter')) {
    return { databaseType: 'Hive (NoSQL)', databaseInfo: 'hive' };
  }
  if (deps.includes('isar') || deps.includes('isar_flutter_libs')) {
    return { databaseType: 'Isar (NoSQL)', databaseInfo: 'isar' };
  }
  if (deps.includes('realm')) {
    return { databaseType: 'Realm (NoSQL)', databaseInfo: 'realm' };
  }
  if (deps.includes('objectbox')) {
    return { databaseType: 'ObjectBox (NoSQL)', databaseInfo: 'objectbox' };
  }
  if (deps.includes('firebase_database') || deps.includes('cloud_firestore')) {
    return { databaseType: 'Firebase', databaseInfo: deps.includes('cloud_firestore') ? 'firestore' : 'realtime_database' };
  }
  if (deps.includes('supabase') || deps.includes('supabase_flutter')) {
    return { databaseType: 'Supabase', databaseInfo: 'supabase' };
  }

  return { databaseType: null, databaseInfo: null };
}

/**
 * Find the entry point by searching for main*.dart files
 */
function findEntryPoint(projectPath: string): string {
  const libPath = path.join(projectPath, 'lib');
  if (!fs.existsSync(libPath)) {
    return 'lib/main.dart';
  }

  // Priority order for main files
  const mainFiles: string[] = [];

  // Search lib/ directory for main*.dart files
  const searchForMain = (dir: string, relativePath: string) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.startsWith('main') && entry.name.endsWith('.dart')) {
          mainFiles.push(path.join(relativePath, entry.name));
        }
      }
    } catch {
      // Ignore errors
    }
  };

  searchForMain(libPath, 'lib');

  if (mainFiles.length === 0) {
    return 'lib/main.dart';
  }

  // Prefer main.dart, then main_prod.dart, then main_dev.dart, then first found
  if (mainFiles.includes('lib/main.dart')) {
    return 'lib/main.dart';
  }
  if (mainFiles.includes('lib/main_prod.dart')) {
    return 'lib/main_prod.dart';
  }
  if (mainFiles.includes('lib/main_dev.dart')) {
    return 'lib/main_dev.dart';
  }

  return mainFiles[0];
}

/**
 * Search for a file containing specific content patterns
 * Returns the relative path of the first file found, or null
 */
function findFileWithContent(
  projectPath: string,
  searchDir: string,
  patterns: string[]
): string | null {
  const fullDir = path.join(projectPath, searchDir);
  if (!fs.existsSync(fullDir)) {
    return null;
  }

  const skipDirs = ['build', '.dart_tool', '.idea', 'test', 'node_modules', '.git', 'dist'];

  const searchRecursively = (dir: string): string | null => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      // Check files first
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.dart')) {
          const fullPath = path.join(dir, entry.name);
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            for (const pattern of patterns) {
              if (content.includes(pattern)) {
                return path.relative(projectPath, fullPath);
              }
            }
          } catch {
            // Skip unreadable files
          }
        }
      }

      // Then check subdirectories
      for (const entry of entries) {
        if (entry.isDirectory() && !skipDirs.includes(entry.name) && !entry.name.startsWith('.')) {
          const result = searchRecursively(path.join(dir, entry.name));
          if (result) return result;
        }
      }
    } catch {
      // Ignore errors
    }

    return null;
  };

  return searchRecursively(fullDir);
}
