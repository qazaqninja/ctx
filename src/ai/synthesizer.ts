import { generateWithProgress } from './ollama.js';
import type { AnalysisResult, SemanticPattern } from './analyzer.js';

export interface SynthesizedConstraints {
  architectureRules: string[];
  conventions: string[];
  constraints: string[];
  uncertainAreas: string[];
}

function buildPrompt(analysis: AnalysisResult, codebaseInfo: string): string {
  // Build pattern summary - focus on high-confidence patterns
  const strongPatterns = analysis.patterns
    .filter(p => p.confidence === 'observed')
    .slice(0, 5);

  const patternSummary = strongPatterns.length > 0
    ? strongPatterns.map(p => `- ${p.name} (${p.files.slice(0, 2).join(', ')})`).join('\n')
    : '- No strong patterns detected';

  const crossFileInfo = analysis.crossFilePatterns.length > 0
    ? analysis.crossFilePatterns.slice(0, 3).map(p => `- ${p.name}`).join('\n')
    : '';

  // Detect if this is a mobile/Flutter app vs backend API
  const isFlutterApp = codebaseInfo.toLowerCase().includes('flutter') ||
                       codebaseInfo.toLowerCase().includes('dart');
  const isBackendApi = codebaseInfo.toLowerCase().includes('express') ||
                       codebaseInfo.toLowerCase().includes('fastapi') ||
                       codebaseInfo.toLowerCase().includes('api');

  // Use framework-appropriate examples
  const archExample = isFlutterApp
    ? 'Separate UI widgets from business logic using BLoC/Cubit'
    : isBackendApi
    ? 'Use the controller pattern for API endpoints'
    : 'Keep related code together in feature modules';

  const constraintExample = isFlutterApp
    ? 'Do not call repositories directly from widgets'
    : 'Do not bypass the established patterns';

  // Use a simpler, more direct prompt with few-shot example
  return `Analyze this codebase and list the coding rules developers must follow.

Project: ${codebaseInfo}

Detected patterns:
${patternSummary}
${crossFileInfo ? `\nCross-file patterns:\n${crossFileInfo}` : ''}

Based on these patterns, complete the lists below. Be specific and actionable.
${isFlutterApp ? 'This is a mobile app - focus on UI/state management patterns, not API endpoints.' : ''}

ARCHITECTURE_RULES (structural patterns to follow):
- ${archExample}
- ${strongPatterns[0]?.name ? `Follow the ${strongPatterns[0].name} consistently` : 'Keep related code together'}

CONVENTIONS (naming and style):
-

CONSTRAINTS (what NOT to do):
- ${constraintExample}
-

UNCERTAIN (needs human review):
- `;
}

// Patterns to filter out LLM conversational artifacts
const LLM_ARTIFACTS = [
  /^#{1,4}\s*/,                          // Markdown headers: ###, ##, etc.
  /\*{2,}/g,                              // Bold markers: **
  /^would you like/i,                     // Conversational: "Would you like..."
  /^let me/i,                             // Conversational: "Let me..."
  /^here('s| is| are)/i,                  // Conversational: "Here's..."
  /^i('ll| will| can)/i,                  // Conversational: "I'll..."
  /^please/i,                             // Conversational: "Please..."
  /^note:/i,                              // Meta: "Note:"
  /^example:/i,                           // Meta: "Example:"
  /^\s*```/,                              // Code blocks
  /^---+$/,                               // Horizontal rules
  /\[.*?\]\(.*?\)/g,                      // Markdown links
];

function cleanLine(line: string): string {
  let cleaned = line;
  for (const pattern of LLM_ARTIFACTS) {
    cleaned = cleaned.replace(pattern, '');
  }
  return cleaned.trim();
}

function isValidConstraint(line: string): boolean {
  const cleaned = cleanLine(line);
  // Must have meaningful content
  if (cleaned.length < 5) return false;
  // Skip section headers that leaked through
  if (/^(architecture|conventions?|constraints?|uncertain|rules?|patterns?)\s*:?\s*$/i.test(cleaned)) return false;
  // Skip meta-commentary
  if (/^(based on|according to|as seen in|from the)/i.test(cleaned)) return false;
  return true;
}

function parseResponse(response: string): SynthesizedConstraints {
  // Extract lists from completion-style response
  const extractSection = (header: string): string[] => {
    // Match section header and capture everything until next section or end
    const pattern = new RegExp(
      `${header}[^:]*:\\s*([\\s\\S]*?)(?=(?:ARCHITECTURE_RULES|CONVENTIONS|CONSTRAINTS|UNCERTAIN)[^:]*:|$)`,
      'i'
    );
    const match = response.match(pattern);
    if (!match) return [];

    return match[1]
      .split('\n')
      .map(line => line.replace(/^[\s\-*\d.]+/, '').trim())  // Strip whitespace, dashes, asterisks, numbers
      .map(cleanLine)
      .filter(isValidConstraint);
  };

  return {
    architectureRules: extractSection('ARCHITECTURE_RULES'),
    conventions: extractSection('CONVENTIONS'),
    constraints: extractSection('CONSTRAINTS'),
    uncertainAreas: extractSection('UNCERTAIN'),
  };
}

export async function synthesizeConstraints(
  model: string,
  analysis: AnalysisResult,
  codebaseInfo: string,
  onProgress?: (tokens: number, done: boolean) => void
): Promise<SynthesizedConstraints> {
  const prompt = buildPrompt(analysis, codebaseInfo);

  try {
    const response = await generateWithProgress(model, prompt, {
      temperature: 0.1,
      maxTokens: 2000,
    }, onProgress);

    return parseResponse(response);
  } catch (err) {
    console.error(`\nSynthesis failed: ${err}`);
    // Return empty constraints on failure
    return {
      architectureRules: [],
      conventions: [],
      constraints: [],
      uncertainAreas: ['Synthesis failed - review patterns manually'],
    };
  }
}

export function mergeWithHeuristics(
  synthesized: SynthesizedConstraints,
  heuristicConventions: string[]
): SynthesizedConstraints {
  // Combine synthesized conventions with heuristic ones, avoiding duplicates
  const allConventions = new Set([
    ...synthesized.conventions,
    ...heuristicConventions,
  ]);

  return {
    ...synthesized,
    conventions: [...allConventions],
  };
}

export function formatConstraintsForYaml(constraints: SynthesizedConstraints): {
  ai_constraints: {
    architecture_rules: string[];
    conventions: string[];
    constraints: string[];
    uncertain: string[];
  };
} {
  return {
    ai_constraints: {
      architecture_rules: constraints.architectureRules,
      conventions: constraints.conventions,
      constraints: constraints.constraints,
      uncertain: constraints.uncertainAreas,
    },
  };
}
