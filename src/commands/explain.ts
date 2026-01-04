import fs from 'fs';
import path from 'path';
import { loadContext, explainArchitecture, explainConventions, explainUncertain, explainSemanticPatterns, explainAIConstraints } from '../synthesis/explainer.js';
import type { ExtendedContext } from '../synthesis/explainer.js';
import { detectFramework, renderTemplate, parseProjectForFramework } from '../templates/index.js';

const CTX_DIR = '.ctx';

export async function explain(topic?: string): Promise<void> {
  const ctxPath = path.join(process.cwd(), CTX_DIR);
  const projectPath = process.cwd();

  if (!fs.existsSync(ctxPath)) {
    console.error(`Error: ${CTX_DIR}/ not found. Run "ctx init" first.`);
    process.exit(1);
  }

  const context = await loadContext(ctxPath);

  // Check if we should use a framework-specific template
  const frameworkId = detectFramework(
    context.manifest.language?.value,
    context.manifest.framework?.value,
    context.architecture.patterns?.state_management?.value
  );

  // If --template flag is used or a framework is detected, try to use template
  const useTemplate = topic === 'template' || (topic === undefined && frameworkId !== undefined);

  if (useTemplate && frameworkId) {
    try {
      const templateData = await parseProjectForFramework(projectPath, context, frameworkId);
      const output = renderTemplate(frameworkId, templateData);

      if (output) {
        console.log(output);
        return;
      }
    } catch (error) {
      // Fall back to generic output if template rendering fails
      console.error(`Note: Template rendering failed, falling back to generic output.`);
    }
  }

  // Fall back to generic explain output
  if (topic === 'architecture') {
    console.log(explainArchitecture(context.architecture));
    if (context.semanticPatterns && context.semanticPatterns.length > 0) {
      console.log('\nSemantic patterns (AI-detected):');
      console.log(explainSemanticPatterns(context.semanticPatterns));
    }
  } else if (topic === 'conventions') {
    console.log(explainConventions(context.conventions));
  } else if (topic === 'constraints' && context.aiConstraints) {
    console.log(explainAIConstraints(context.aiConstraints));
  } else if (topic === 'template') {
    // Explicitly requested template but no framework detected
    console.log('No framework-specific template available for this project.');
    console.log('Supported frameworks: flutter-bloc, flutter-riverpod, express, nextjs');
    console.log('\nFalling back to generic output:\n');
    printGenericExplain(context);
  } else {
    printGenericExplain(context);
  }
}

function printGenericExplain(context: ExtendedContext): void {
  console.log('This codebase favors:\n');
  console.log(explainArchitecture(context.architecture));
  console.log(explainConventions(context.conventions));

  if (context.semanticPatterns && context.semanticPatterns.length > 0) {
    console.log('\nSemantic patterns (AI-detected):');
    console.log(explainSemanticPatterns(context.semanticPatterns));
  }

  if (context.aiConstraints) {
    console.log('\nAI-generated constraints:');
    console.log(explainAIConstraints(context.aiConstraints));
  }

  const uncertain = explainUncertain(context);
  if (uncertain) {
    console.log('\nUncertain:');
    console.log(uncertain);
  }
}
