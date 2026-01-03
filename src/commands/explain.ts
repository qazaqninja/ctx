import fs from 'fs';
import path from 'path';
import { loadContext, explainArchitecture, explainConventions, explainUncertain, explainSemanticPatterns, explainAIConstraints } from '../synthesis/explainer.js';

const CTX_DIR = '.ctx';

export async function explain(topic?: string): Promise<void> {
  const ctxPath = path.join(process.cwd(), CTX_DIR);

  if (!fs.existsSync(ctxPath)) {
    console.error(`Error: ${CTX_DIR}/ not found. Run "ctx init" first.`);
    process.exit(1);
  }

  const context = await loadContext(ctxPath);

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
  } else {
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
}
