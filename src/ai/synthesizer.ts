import YAML from 'yaml';
import { generate } from './ollama.js';
import type { AnalysisResult, SemanticPattern } from './analyzer.js';

export interface SynthesizedConstraints {
  architectureRules: string[];
  conventions: string[];
  constraints: string[];
  uncertainAreas: string[];
}

function buildPrompt(analysis: AnalysisResult, codebaseInfo: string): string {
  const patternDescriptions = [
    ...analysis.patterns.map(p => `- ${p.name}: ${p.description} (${p.confidence})`),
    ...analysis.crossFilePatterns.map(p => `- Cross-file ${p.name}: ${p.description}`),
  ];

  const anomalyInfo = analysis.anomalies.length > 0
    ? `\nAnomalies (code that doesn't fit patterns): ${analysis.anomalies.length} chunks`
    : '';

  return `You are analyzing a codebase to extract development rules and constraints.

CODEBASE INFO:
${codebaseInfo}

DETECTED PATTERNS:
${patternDescriptions.join('\n')}
${anomalyInfo}

Based on these patterns, generate:

1. ARCHITECTURE RULES - What structural patterns MUST be followed
2. CONVENTIONS - Naming, organization, and style conventions
3. CONSTRAINTS - What NOT to do (anti-patterns to avoid)
4. UNCERTAIN - Areas that need human confirmation

Output ONLY valid YAML in this exact format:

\`\`\`yaml
architecture_rules:
  - "Rule 1"
  - "Rule 2"
conventions:
  - "Convention 1"
constraints:
  - "Constraint 1"
uncertain:
  - "Question 1"
\`\`\`

Be specific and actionable. Reference the detected patterns.`;
}

function parseYamlResponse(response: string): SynthesizedConstraints {
  // Extract YAML block from response
  const yamlMatch = response.match(/```yaml\n?([\s\S]*?)```/);
  const yamlContent = yamlMatch ? yamlMatch[1] : response;

  try {
    const parsed = YAML.parse(yamlContent);
    return {
      architectureRules: Array.isArray(parsed.architecture_rules) ? parsed.architecture_rules : [],
      conventions: Array.isArray(parsed.conventions) ? parsed.conventions : [],
      constraints: Array.isArray(parsed.constraints) ? parsed.constraints : [],
      uncertainAreas: Array.isArray(parsed.uncertain) ? parsed.uncertain : [],
    };
  } catch {
    // Fallback: try to extract lists manually
    const extractList = (pattern: RegExp): string[] => {
      const matches = response.match(pattern);
      if (!matches) return [];
      return matches[1]
        .split('\n')
        .map(line => line.replace(/^[\s-]*["']?|["']?$/g, '').trim())
        .filter(line => line.length > 0);
    };

    return {
      architectureRules: extractList(/architecture_rules:\s*((?:\n\s*-[^\n]+)+)/),
      conventions: extractList(/conventions:\s*((?:\n\s*-[^\n]+)+)/),
      constraints: extractList(/constraints:\s*((?:\n\s*-[^\n]+)+)/),
      uncertainAreas: extractList(/uncertain:\s*((?:\n\s*-[^\n]+)+)/),
    };
  }
}

export async function synthesizeConstraints(
  model: string,
  analysis: AnalysisResult,
  codebaseInfo: string
): Promise<SynthesizedConstraints> {
  const prompt = buildPrompt(analysis, codebaseInfo);

  try {
    const response = await generate(model, prompt, {
      temperature: 0.1,
      maxTokens: 2000,
    });

    return parseYamlResponse(response);
  } catch (err) {
    console.error(`Synthesis failed: ${err}`);
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
