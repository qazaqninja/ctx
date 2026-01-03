import type { FullContext } from '../types/schema.js';
import { explainArchitecture, explainConventions } from './explainer.js';

export function formatForAI(context: FullContext, task?: string): string {
  const sections: string[] = [];

  sections.push('## Context for AI\n');

  if (context.manifest.name) {
    let intro = `This is ${context.manifest.name}`;
    if (context.manifest.language?.value) {
      intro += `, a ${context.manifest.language.value}`;
      if (context.manifest.framework?.value) {
        intro += ` ${context.manifest.framework.value}`;
      }
      intro += ' project.';
    } else {
      intro += '.';
    }
    sections.push(intro);
  }

  sections.push('\n### Architecture\n');
  sections.push(explainArchitecture(context.architecture));

  const conventions = explainConventions(context.conventions);
  if (conventions) {
    sections.push('\n### Conventions\n');
    sections.push(conventions);
  }

  sections.push('\n### Constraints\n');
  sections.push('- Follow existing patterns in the codebase');
  sections.push('- No new dependencies without explicit approval');
  sections.push('- Match naming conventions');

  if (context.architecture.boundaries && context.architecture.boundaries.length > 0) {
    const example = context.architecture.boundaries[0];
    sections.push(`- See existing ${example.name} files for reference`);
  }

  if (task) {
    sections.push('\n### Task\n');
    sections.push(task);
    sections.push('\n');
    sections.push(getTaskGuidance(context, task));
  }

  sections.push('\n---');
  sections.push('Ready to paste into Claude/ChatGPT/Cursor.');

  return sections.join('\n');
}

function getTaskGuidance(context: FullContext, task: string): string {
  const lines: string[] = [];
  const taskLower = task.toLowerCase();

  if (taskLower.includes('middleware')) {
    lines.push('Middleware should:');
    lines.push('- Live in the middleware directory if one exists');
    lines.push('- Follow existing middleware patterns');
  }

  if (taskLower.includes('api') || taskLower.includes('endpoint') || taskLower.includes('route')) {
    lines.push('API routes should:');
    if (context.architecture.boundaries?.some(b => b.name === 'controller')) {
      lines.push('- Use controller pattern');
    }
    if (context.architecture.boundaries?.some(b => b.name === 'service')) {
      lines.push('- Delegate business logic to services');
    }
  }

  if (taskLower.includes('test')) {
    lines.push('Tests should:');
    lines.push('- Follow existing test patterns');
    lines.push('- Use project test framework');
  }

  return lines.join('\n');
}
