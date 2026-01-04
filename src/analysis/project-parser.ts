import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import type { FileEntry } from '../types/schema.js';

// Import FLUTTER_PACKAGE_MAPPINGS from patterns.ts
import { FLUTTER_PACKAGE_MAPPINGS } from './patterns.js';

// Re-export for external use
export { FLUTTER_PACKAGE_MAPPINGS };

/**
 * Key dependency with its purpose extracted from project config files
 */
export interface KeyDependency {
  name: string;
  version?: string;
  purpose: string;
}

/**
 * Extracted data from a Flutter project - all fields are observed (parsed), not inferred
 */
export interface FlutterProjectData {
  /** Project name from pubspec.yaml */
  name: string;
  /** Project description from pubspec.yaml */
  description?: string;
  /** Entry point files (main.dart, main_dev.dart, main_prod.dart, etc.) */
  entryPoints: string[];
  /** Feature directories under lib/src/features/ or lib/features/ */
  features: string[];
  /** BLoC names extracted from *_bloc.dart files */
  blocs: string[];
  /** Cubit names extracted from *_cubit.dart files */
  cubits: string[];
  /** Page file paths from *_page.dart files */
  pages: string[];
  /** Detected database solution from pubspec.yaml */
  database?: 'drift' | 'sqflite' | 'hive' | 'isar' | 'objectbox';
  /** Path to the database definition file (e.g., file with @DriftDatabase) */
  databaseFile?: string;
  /** Path to the router file (router.dart or routes.dart) */
  routerFile?: string;
  /** Path to the bloc registration file (where MultiBlocProvider is used) */
  blocRegistrationFile?: string;
  /** Whether freezed is in dev_dependencies */
  usesFreezed: boolean;
  /** Key dependencies with their purposes */
  keyDependencies: KeyDependency[];
}

/**
 * Extracted data from an Express project - all fields are observed (parsed), not inferred
 */
export interface ExpressProjectData {
  /** Project name from package.json */
  name: string;
  /** Main entry point file (index.ts, app.ts, server.ts, etc.) */
  entryPoint?: string;
  /** Route file paths */
  routes: string[];
  /** Middleware file paths */
  middlewares: string[];
  /** Detected database/ORM solution */
  database?: 'prisma' | 'typeorm' | 'sequelize' | 'mongoose' | 'knex';
  /** Key dependencies with their purposes */
  keyDependencies: KeyDependency[];
}

/**
 * Extracted data from a Next.js project - all fields are observed (parsed), not inferred
 */
export interface NextProjectData {
  /** Project name from package.json */
  name: string;
  /** Whether using app directory (Next.js 13+) or pages directory */
  appDir: boolean;
  /** API route file paths */
  apiRoutes: string[];
  /** Component directory paths */
  components: string[];
  /** Page file paths */
  pages: string[];
  /** Key dependencies with their purposes */
  keyDependencies: KeyDependency[];
}

// Note: FLUTTER_PACKAGE_MAPPINGS is imported from patterns.ts above

// Express/Node.js package to purpose mappings
const EXPRESS_PACKAGE_MAPPINGS: Record<string, string> = {
  // Core
  'express': 'Web framework',
  'fastify': 'Web framework',
  'koa': 'Web framework',
  'hapi': 'Web framework',

  // Database
  'prisma': 'Database ORM with type safety',
  '@prisma/client': 'Prisma database client',
  'typeorm': 'TypeScript ORM',
  'sequelize': 'Promise-based ORM',
  'mongoose': 'MongoDB ODM',
  'knex': 'SQL query builder',
  'pg': 'PostgreSQL client',
  'mysql2': 'MySQL client',
  'mongodb': 'MongoDB driver',
  'redis': 'Redis client',
  'ioredis': 'Redis client',

  // Authentication
  'passport': 'Authentication middleware',
  'jsonwebtoken': 'JWT authentication',
  'bcrypt': 'Password hashing',
  'bcryptjs': 'Password hashing',
  'express-session': 'Session management',

  // Validation
  'zod': 'Schema validation',
  'joi': 'Schema validation',
  'yup': 'Schema validation',
  'class-validator': 'Decorator-based validation',

  // API Documentation
  'swagger-ui-express': 'Swagger API docs',
  'swagger-jsdoc': 'Swagger JSDoc',
  '@nestjs/swagger': 'NestJS Swagger integration',

  // Middleware
  'cors': 'CORS middleware',
  'helmet': 'Security headers',
  'morgan': 'HTTP request logger',
  'compression': 'Response compression',
  'body-parser': 'Request body parsing',
  'multer': 'File upload handling',

  // Testing
  'jest': 'Testing framework',
  'mocha': 'Testing framework',
  'supertest': 'HTTP testing',

  // Utilities
  'dotenv': 'Environment variables',
  'winston': 'Logging',
  'pino': 'Fast logging',
  'lodash': 'Utility functions',
  'axios': 'HTTP client',
  'node-fetch': 'Fetch API',
};

// Next.js package to purpose mappings
const NEXT_PACKAGE_MAPPINGS: Record<string, string> = {
  // Core
  'next': 'React framework',
  'react': 'UI library',
  'react-dom': 'React DOM renderer',

  // State Management
  'zustand': 'State management',
  'jotai': 'Atomic state management',
  'recoil': 'State management',
  '@reduxjs/toolkit': 'Redux state management',
  'react-query': 'Server state management',
  '@tanstack/react-query': 'Server state management',
  'swr': 'Data fetching and caching',

  // Styling
  'tailwindcss': 'Utility-first CSS',
  '@emotion/react': 'CSS-in-JS',
  '@emotion/styled': 'Styled components (Emotion)',
  'styled-components': 'CSS-in-JS',
  'sass': 'Sass preprocessor',
  '@chakra-ui/react': 'Component library',
  '@mui/material': 'Material UI components',
  'shadcn-ui': 'Customizable components',

  // Forms
  'react-hook-form': 'Form handling',
  'formik': 'Form handling',

  // Authentication
  'next-auth': 'Authentication for Next.js',
  '@auth/core': 'Auth.js core',
  '@clerk/nextjs': 'Clerk authentication',

  // Database
  'prisma': 'Database ORM',
  '@prisma/client': 'Prisma client',
  'drizzle-orm': 'TypeScript ORM',

  // Testing
  '@testing-library/react': 'React testing utilities',
  'jest': 'Testing framework',
  'cypress': 'E2E testing',
  'playwright': 'E2E testing',

  // Utilities
  'zod': 'Schema validation',
  'trpc': 'Type-safe API',
  '@trpc/server': 'tRPC server',
  '@trpc/client': 'tRPC client',
  '@trpc/react-query': 'tRPC React Query integration',
};

/**
 * Parse a pubspec.yaml file and extract its contents
 */
function parsePubspec(pubspecPath: string): Record<string, unknown> | null {
  if (!fs.existsSync(pubspecPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(pubspecPath, 'utf-8');
    return YAML.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Parse a package.json file and extract its contents
 */
function parsePackageJson(packageJsonPath: string): Record<string, unknown> | null {
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(packageJsonPath, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Extract bloc name from a *_bloc.dart file path
 * e.g., lib/src/features/auth/bloc/auth_bloc.dart -> Auth
 */
function extractBlocName(filePath: string): string {
  const fileName = path.basename(filePath, '.dart');
  // Remove _bloc suffix and convert to PascalCase
  const name = fileName.replace(/_bloc$/, '');
  return toPascalCase(name);
}

/**
 * Extract cubit name from a *_cubit.dart file path
 * e.g., lib/src/features/settings/cubit/theme_cubit.dart -> Theme
 */
function extractCubitName(filePath: string): string {
  const fileName = path.basename(filePath, '.dart');
  // Remove _cubit suffix and convert to PascalCase
  const name = fileName.replace(/_cubit$/, '');
  return toPascalCase(name);
}

/**
 * Convert snake_case to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

/**
 * Find file containing a specific annotation or pattern
 */
function findFileWithPattern(root: string, files: FileEntry[], pattern: RegExp): string | undefined {
  for (const file of files) {
    try {
      const content = fs.readFileSync(file.path, 'utf-8');
      if (pattern.test(content)) {
        return file.relativePath;
      }
    } catch {
      // Skip unreadable files
    }
  }
  return undefined;
}

/**
 * Find file containing MultiBlocProvider (bloc registration)
 */
function findBlocRegistrationFile(root: string, files: FileEntry[]): string | undefined {
  // First look for common file names
  const commonNames = ['application.dart', 'app.dart', 'bloc_providers.dart', 'providers.dart'];

  for (const name of commonNames) {
    const file = files.find(f => f.relativePath.endsWith(name));
    if (file) {
      try {
        const content = fs.readFileSync(file.path, 'utf-8');
        if (content.includes('MultiBlocProvider') || content.includes('BlocProvider')) {
          return file.relativePath;
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  // Search all dart files for MultiBlocProvider
  return findFileWithPattern(root, files, /MultiBlocProvider\s*\(/);
}

/**
 * Find the router file (go_router, auto_route, or manual routes)
 */
function findRouterFile(root: string, files: FileEntry[]): string | undefined {
  // Common router file names
  const routerNames = ['router.dart', 'routes.dart', 'app_router.dart', 'app_routes.dart', 'navigation.dart'];

  for (const name of routerNames) {
    const file = files.find(f => f.relativePath.endsWith(name) || f.relativePath.endsWith(`/${name}`));
    if (file) {
      return file.relativePath;
    }
  }

  // Search for files with GoRouter or @MaterialAutoRouter
  return findFileWithPattern(root, files, /GoRouter\s*\(|@MaterialAutoRouter|@AutoRouterConfig/);
}

/**
 * Find the database definition file (Drift @DriftDatabase, etc.)
 */
function findDatabaseFile(root: string, files: FileEntry[], dbType: string | undefined): string | undefined {
  if (!dbType) return undefined;

  if (dbType === 'drift') {
    // Look for @DriftDatabase annotation
    return findFileWithPattern(root, files, /@DriftDatabase\s*\(/);
  }

  if (dbType === 'hive') {
    // Look for Hive.openBox or HiveObject
    return findFileWithPattern(root, files, /Hive\.openBox|extends HiveObject/);
  }

  if (dbType === 'isar') {
    // Look for @collection annotation
    return findFileWithPattern(root, files, /@collection|Isar\.open/);
  }

  if (dbType === 'sqflite') {
    // Look for openDatabase
    return findFileWithPattern(root, files, /openDatabase\s*\(/);
  }

  return undefined;
}

/**
 * Parse a Flutter project and extract actual data
 */
export function parseFlutterProject(root: string, files: FileEntry[]): FlutterProjectData | null {
  const pubspecPath = path.join(root, 'pubspec.yaml');
  const pubspec = parsePubspec(pubspecPath);

  if (!pubspec) {
    return null;
  }

  // Extract name and description
  const name = (pubspec.name as string) || 'unknown';
  const description = pubspec.description as string | undefined;

  // Find entry points (main*.dart files)
  const entryPoints = files
    .filter(f => {
      const fileName = path.basename(f.relativePath);
      return fileName.startsWith('main') && fileName.endsWith('.dart');
    })
    .map(f => f.relativePath);

  // Find features directories
  const features: string[] = [];
  const featurePaths = ['lib/src/features', 'lib/features', 'lib/src/modules', 'lib/modules'];

  for (const featurePath of featurePaths) {
    const fullPath = path.join(root, featurePath);
    if (fs.existsSync(fullPath)) {
      try {
        const dirs = fs.readdirSync(fullPath, { withFileTypes: true });
        for (const dir of dirs) {
          if (dir.isDirectory()) {
            features.push(dir.name);
          }
        }
      } catch {
        // Skip if can't read directory
      }
    }
  }

  // Find blocs (*_bloc.dart files)
  const blocFiles = files.filter(f => /_bloc\.dart$/.test(f.relativePath));
  const blocs = blocFiles.map(f => extractBlocName(f.relativePath));

  // Find cubits (*_cubit.dart files)
  const cubitFiles = files.filter(f => /_cubit\.dart$/.test(f.relativePath));
  const cubits = cubitFiles.map(f => extractCubitName(f.relativePath));

  // Find pages (*_page.dart files)
  const pageFiles = files.filter(f => /_page\.dart$/.test(f.relativePath));
  const pages = pageFiles.map(f => f.relativePath);

  // Detect database from dependencies
  const dependencies = pubspec.dependencies as Record<string, unknown> | undefined || {};
  let database: FlutterProjectData['database'];

  if ('drift' in dependencies) {
    database = 'drift';
  } else if ('sqflite' in dependencies) {
    database = 'sqflite';
  } else if ('hive' in dependencies || 'hive_flutter' in dependencies) {
    database = 'hive';
  } else if ('isar' in dependencies || 'isar_flutter_libs' in dependencies) {
    database = 'isar';
  } else if ('objectbox' in dependencies) {
    database = 'objectbox';
  }

  // Find database file
  const databaseFile = findDatabaseFile(root, files, database);

  // Find router file
  const routerFile = findRouterFile(root, files);

  // Find bloc registration file
  const blocRegistrationFile = findBlocRegistrationFile(root, files);

  // Check for freezed in dev_dependencies
  const devDependencies = pubspec.dev_dependencies as Record<string, unknown> | undefined || {};
  const usesFreezed = 'freezed' in devDependencies || 'freezed_annotation' in dependencies;

  // Extract key dependencies with purposes
  const keyDependencies: KeyDependency[] = [];

  for (const [depName, depValue] of Object.entries(dependencies)) {
    if (depName === 'flutter') continue; // Skip flutter SDK

    const purpose = FLUTTER_PACKAGE_MAPPINGS[depName];
    if (purpose) {
      keyDependencies.push({
        name: depName,
        version: typeof depValue === 'string' ? depValue : undefined,
        purpose,
      });
    }
  }

  return {
    name,
    description,
    entryPoints,
    features,
    blocs,
    cubits,
    pages,
    database,
    databaseFile,
    routerFile,
    blocRegistrationFile,
    usesFreezed,
    keyDependencies,
  };
}

/**
 * Parse an Express.js project and extract actual data
 */
export function parseExpressProject(root: string, files: FileEntry[]): ExpressProjectData | null {
  const packageJsonPath = path.join(root, 'package.json');
  const packageJson = parsePackageJson(packageJsonPath);

  if (!packageJson) {
    return null;
  }

  // Check if this is an Express project
  const dependencies = packageJson.dependencies as Record<string, string> | undefined || {};
  const devDependencies = packageJson.devDependencies as Record<string, string> | undefined || {};
  const allDeps = { ...dependencies, ...devDependencies };

  if (!('express' in allDeps)) {
    return null;
  }

  // Extract name
  const name = (packageJson.name as string) || 'unknown';

  // Find entry point
  const entryPointNames = ['index.ts', 'index.js', 'app.ts', 'app.js', 'server.ts', 'server.js', 'main.ts', 'main.js'];
  let entryPoint: string | undefined;

  // Check package.json main field first
  if (packageJson.main) {
    entryPoint = packageJson.main as string;
  } else {
    // Look for common entry point files in src/ or root
    for (const epName of entryPointNames) {
      const srcPath = files.find(f => f.relativePath === `src/${epName}`);
      if (srcPath) {
        entryPoint = srcPath.relativePath;
        break;
      }
      const rootPath = files.find(f => f.relativePath === epName);
      if (rootPath) {
        entryPoint = rootPath.relativePath;
        break;
      }
    }
  }

  // Find route files
  const routes = files
    .filter(f => {
      const fileName = path.basename(f.relativePath);
      const dirName = path.dirname(f.relativePath);
      return (
        fileName.includes('route') ||
        dirName.includes('routes') ||
        dirName.includes('router')
      );
    })
    .map(f => f.relativePath);

  // Find middleware files
  const middlewares = files
    .filter(f => {
      const fileName = path.basename(f.relativePath);
      const dirName = path.dirname(f.relativePath);
      return (
        fileName.includes('middleware') ||
        dirName.includes('middleware') ||
        dirName.includes('middlewares')
      );
    })
    .map(f => f.relativePath);

  // Detect database/ORM
  let database: ExpressProjectData['database'];

  if ('prisma' in allDeps || '@prisma/client' in allDeps) {
    database = 'prisma';
  } else if ('typeorm' in allDeps) {
    database = 'typeorm';
  } else if ('sequelize' in allDeps) {
    database = 'sequelize';
  } else if ('mongoose' in allDeps) {
    database = 'mongoose';
  } else if ('knex' in allDeps) {
    database = 'knex';
  }

  // Extract key dependencies with purposes
  const keyDependencies: KeyDependency[] = [];

  for (const [depName, depValue] of Object.entries(dependencies)) {
    const purpose = EXPRESS_PACKAGE_MAPPINGS[depName];
    if (purpose) {
      keyDependencies.push({
        name: depName,
        version: typeof depValue === 'string' ? depValue : undefined,
        purpose,
      });
    }
  }

  return {
    name,
    entryPoint,
    routes,
    middlewares,
    database,
    keyDependencies,
  };
}

/**
 * Parse a Next.js project and extract actual data
 */
export function parseNextProject(root: string, files: FileEntry[]): NextProjectData | null {
  const packageJsonPath = path.join(root, 'package.json');
  const packageJson = parsePackageJson(packageJsonPath);

  if (!packageJson) {
    return null;
  }

  // Check if this is a Next.js project
  const dependencies = packageJson.dependencies as Record<string, string> | undefined || {};
  const devDependencies = packageJson.devDependencies as Record<string, string> | undefined || {};
  const allDeps = { ...dependencies, ...devDependencies };

  if (!('next' in allDeps)) {
    return null;
  }

  // Extract name
  const name = (packageJson.name as string) || 'unknown';

  // Detect if using app directory (Next.js 13+) or pages directory
  const hasAppDir = fs.existsSync(path.join(root, 'app')) || fs.existsSync(path.join(root, 'src/app'));
  const hasPagesDir = fs.existsSync(path.join(root, 'pages')) || fs.existsSync(path.join(root, 'src/pages'));
  const appDir = hasAppDir || !hasPagesDir; // Default to app dir for new projects

  // Find API routes
  const apiRoutes: string[] = [];

  if (appDir) {
    // App Router: look for route.ts/js files in app/api/
    apiRoutes.push(
      ...files
        .filter(f => {
          const parts = f.relativePath.split(path.sep);
          return (
            parts.includes('api') &&
            (f.relativePath.endsWith('route.ts') || f.relativePath.endsWith('route.js'))
          );
        })
        .map(f => f.relativePath)
    );
  } else {
    // Pages Router: look for files in pages/api/
    apiRoutes.push(
      ...files
        .filter(f => {
          const parts = f.relativePath.split(path.sep);
          const pagesIndex = parts.indexOf('pages');
          return pagesIndex !== -1 && parts[pagesIndex + 1] === 'api';
        })
        .map(f => f.relativePath)
    );
  }

  // Find component directories
  const componentDirs = new Set<string>();
  const componentPatterns = ['components', 'ui', 'shared'];

  for (const file of files) {
    const parts = file.relativePath.split(path.sep);
    for (let i = 0; i < parts.length - 1; i++) {
      if (componentPatterns.includes(parts[i].toLowerCase())) {
        componentDirs.add(parts.slice(0, i + 1).join(path.sep));
      }
    }
  }

  // Find pages
  const pages: string[] = [];

  if (appDir) {
    // App Router: look for page.tsx/js files
    pages.push(
      ...files
        .filter(f => f.relativePath.endsWith('page.tsx') || f.relativePath.endsWith('page.js'))
        .map(f => f.relativePath)
    );
  } else {
    // Pages Router: files in pages/ directory (excluding api/)
    pages.push(
      ...files
        .filter(f => {
          const parts = f.relativePath.split(path.sep);
          const pagesIndex = parts.indexOf('pages');
          return (
            pagesIndex !== -1 &&
            parts[pagesIndex + 1] !== 'api' &&
            (f.extension === '.tsx' || f.extension === '.jsx' || f.extension === '.ts' || f.extension === '.js')
          );
        })
        .map(f => f.relativePath)
    );
  }

  // Extract key dependencies with purposes
  const keyDependencies: KeyDependency[] = [];

  for (const [depName, depValue] of Object.entries(dependencies)) {
    const purpose = NEXT_PACKAGE_MAPPINGS[depName];
    if (purpose) {
      keyDependencies.push({
        name: depName,
        version: typeof depValue === 'string' ? depValue : undefined,
        purpose,
      });
    }
  }

  return {
    name,
    appDir,
    apiRoutes,
    components: Array.from(componentDirs),
    pages,
    keyDependencies,
  };
}

/**
 * Auto-detect project type and parse accordingly
 */
export function parseProject(root: string, files: FileEntry[]): {
  type: 'flutter' | 'express' | 'next' | 'unknown';
  data: FlutterProjectData | ExpressProjectData | NextProjectData | null;
} {
  // Check for Flutter project
  if (fs.existsSync(path.join(root, 'pubspec.yaml'))) {
    const data = parseFlutterProject(root, files);
    if (data) {
      return { type: 'flutter', data };
    }
  }

  // Check for Node.js projects
  if (fs.existsSync(path.join(root, 'package.json'))) {
    // Try Next.js first (more specific)
    const nextData = parseNextProject(root, files);
    if (nextData) {
      return { type: 'next', data: nextData };
    }

    // Try Express
    const expressData = parseExpressProject(root, files);
    if (expressData) {
      return { type: 'express', data: expressData };
    }
  }

  return { type: 'unknown', data: null };
}
