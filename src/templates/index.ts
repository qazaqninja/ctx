/**
 * Template registry for framework-specific output templates
 */

import * as flutterBloc from './flutter-bloc.js';
import * as flutterRiverpod from './flutter-riverpod.js';
import * as express from './express.js';
import * as nextjs from './nextjs.js';

// Re-export all templates
export { flutterBloc, flutterRiverpod, express, nextjs };

// Template type definitions
export type FrameworkId = 'flutter-bloc' | 'flutter-riverpod' | 'express' | 'nextjs';

export interface Template<T> {
  frameworkId: string;
  render: (data: T) => string;
}

// Type-safe template data types
export type FlutterBlocData = flutterBloc.TemplateData;
export type FlutterRiverpodData = flutterRiverpod.TemplateData;
export type ExpressData = express.TemplateData;
export type NextjsData = nextjs.TemplateData;

// Union type of all template data
export type TemplateData =
  | FlutterBlocData
  | FlutterRiverpodData
  | ExpressData
  | NextjsData;

// Template registry
const templates: Record<FrameworkId, Template<TemplateData>> = {
  'flutter-bloc': {
    frameworkId: flutterBloc.frameworkId,
    render: flutterBloc.render as (data: TemplateData) => string,
  },
  'flutter-riverpod': {
    frameworkId: flutterRiverpod.frameworkId,
    render: flutterRiverpod.render as (data: TemplateData) => string,
  },
  'express': {
    frameworkId: express.frameworkId,
    render: express.render as (data: TemplateData) => string,
  },
  'nextjs': {
    frameworkId: nextjs.frameworkId,
    render: nextjs.render as (data: TemplateData) => string,
  },
};

/**
 * Get all available framework IDs
 */
export function getAvailableFrameworks(): FrameworkId[] {
  return Object.keys(templates) as FrameworkId[];
}

/**
 * Check if a framework template exists
 */
export function hasTemplate(frameworkId: string): frameworkId is FrameworkId {
  return frameworkId in templates;
}

/**
 * Select and return a template by framework ID
 * @param frameworkId - The framework identifier (e.g., 'flutter-bloc', 'express')
 * @returns The template module or undefined if not found
 */
export function selectTemplate(frameworkId: string): Template<TemplateData> | undefined {
  if (!hasTemplate(frameworkId)) {
    return undefined;
  }
  return templates[frameworkId];
}

/**
 * Render output using the appropriate template for a framework
 * @param frameworkId - The framework identifier
 * @param data - The template data
 * @returns Rendered string or undefined if template not found
 */
export function renderTemplate(frameworkId: string, data: TemplateData): string | undefined {
  const template = selectTemplate(frameworkId);
  if (!template) {
    return undefined;
  }
  return template.render(data);
}

/**
 * Detect framework from language and framework hints
 * @param language - The detected language (e.g., 'dart', 'typescript')
 * @param framework - The detected framework (e.g., 'flutter', 'express', 'next')
 * @param stateManagement - The detected state management pattern
 * @returns The best matching framework ID or undefined
 */
export function detectFramework(
  language: string | undefined,
  framework: string | undefined,
  stateManagement?: string
): FrameworkId | undefined {
  const lang = language?.toLowerCase();
  const fw = framework?.toLowerCase();
  const sm = stateManagement?.toLowerCase();

  // Flutter detection
  if (lang === 'dart' || fw === 'flutter') {
    if (sm?.includes('bloc') || sm?.includes('cubit')) {
      return 'flutter-bloc';
    }
    if (sm?.includes('riverpod')) {
      return 'flutter-riverpod';
    }
    // Check for riverpod in dependencies list if state management is provider
    if (sm?.includes('provider')) {
      return 'flutter-riverpod';
    }
    // Default Flutter to BLoC if no state management detected
    return 'flutter-bloc';
  }

  // Next.js detection
  if (fw === 'next' || fw === 'nextjs' || fw === 'next.js') {
    return 'nextjs';
  }

  // Express detection
  if (fw === 'express' || fw === 'express.js') {
    return 'express';
  }

  return undefined;
}

// Re-export parser
export { parseProjectForFramework } from './parser.js';
export type { AnyTemplateData } from './parser.js';
