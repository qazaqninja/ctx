/**
 * ctx MCP Server
 *
 * Exposes ctx analysis as tools for AI assistants like Claude Code.
 * No local LLM required - just serves the .ctx/ analysis data.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

const CTX_DIR = '.ctx';

interface CtxContext {
  manifest: Record<string, unknown>;
  conventions: Record<string, unknown>;
  architecture: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  index?: Record<string, unknown>;
}

function findCtxDir(startPath: string = process.cwd()): string | null {
  let currentPath = startPath;

  while (currentPath !== path.dirname(currentPath)) {
    const ctxPath = path.join(currentPath, CTX_DIR);
    if (fs.existsSync(ctxPath)) {
      return ctxPath;
    }
    currentPath = path.dirname(currentPath);
  }

  return null;
}

function loadCtxContext(ctxPath: string): CtxContext | null {
  try {
    const manifest = YAML.parse(fs.readFileSync(path.join(ctxPath, 'manifest.yaml'), 'utf-8'));
    const conventions = YAML.parse(fs.readFileSync(path.join(ctxPath, 'conventions.yaml'), 'utf-8'));
    const architecture = YAML.parse(fs.readFileSync(path.join(ctxPath, 'architecture.yaml'), 'utf-8'));

    let constraints: Record<string, unknown> | undefined;
    const constraintsPath = path.join(ctxPath, 'constraints.yaml');
    if (fs.existsSync(constraintsPath)) {
      constraints = YAML.parse(fs.readFileSync(constraintsPath, 'utf-8'));
    }

    let index: Record<string, unknown> | undefined;
    const indexPath = path.join(ctxPath, 'index.yaml');
    if (fs.existsSync(indexPath)) {
      index = YAML.parse(fs.readFileSync(indexPath, 'utf-8'));
    }

    return { manifest, conventions, architecture, constraints, index };
  } catch (err) {
    return null;
  }
}

function formatContextForAI(context: CtxContext): string {
  const { manifest, conventions, architecture, constraints } = context;

  const lines: string[] = [];

  // Project overview
  lines.push(`# ${manifest.name || 'Project'} Context`);
  lines.push('');

  if (manifest.description) {
    lines.push(`${manifest.description}`);
    lines.push('');
  }

  // Language and framework
  if (manifest.language || manifest.framework) {
    lines.push(`**Stack:** ${manifest.language || ''}${manifest.framework ? ` + ${manifest.framework}` : ''}`);
    lines.push('');
  }

  // Architecture
  if (architecture.structure) {
    const struct = architecture.structure as { value?: string; evidence?: string[] };
    lines.push(`## Architecture`);
    lines.push(`Pattern: ${struct.value || 'unknown'}`);
    if (struct.evidence) {
      lines.push(`Evidence: ${struct.evidence.slice(0, 2).join(', ')}`);
    }
    lines.push('');
  }

  // Conventions
  if (conventions.naming) {
    lines.push(`## Naming Conventions`);
    const naming = conventions.naming as Record<string, { value?: string }>;
    if (naming.files?.value) lines.push(`- Files: ${naming.files.value}`);
    if (naming.functions?.value) lines.push(`- Functions: ${naming.functions.value}`);
    if (naming.classes?.value) lines.push(`- Classes: ${naming.classes.value}`);
    lines.push('');
  }

  // Dependencies
  if (architecture.dependencies) {
    const deps = architecture.dependencies as { categories?: Record<string, string[]> };
    if (deps.categories) {
      lines.push(`## Key Dependencies`);
      for (const [category, packages] of Object.entries(deps.categories)) {
        if (packages.length > 0) {
          lines.push(`- ${category}: ${packages.join(', ')}`);
        }
      }
      lines.push('');
    }
  }

  // Constraints (AI-generated rules)
  if (constraints?.ai_constraints) {
    const ai = constraints.ai_constraints as {
      architecture_rules?: string[];
      constraints?: string[];
    };

    if (ai.architecture_rules?.length) {
      lines.push(`## Architecture Rules`);
      ai.architecture_rules.slice(0, 5).forEach(rule => {
        lines.push(`- ${rule}`);
      });
      lines.push('');
    }

    if (ai.constraints?.length) {
      lines.push(`## Constraints (Don't Do)`);
      ai.constraints.slice(0, 5).forEach(c => {
        lines.push(`- ${c}`);
      });
      lines.push('');
    }
  }

  return lines.join('\n');
}

function formatExplainOutput(context: CtxContext): string {
  // This mirrors the explain command output
  const { manifest, architecture } = context;

  const lines: string[] = [];
  lines.push(`${manifest.name || 'Project'} - ${manifest.language || ''} ${manifest.framework || ''} project`);
  lines.push('');

  // Structure
  if (architecture.boundaries) {
    lines.push('## Structure');
    const boundaries = architecture.boundaries as Array<{ path?: string; responsibility?: string }>;
    boundaries.slice(0, 5).forEach(b => {
      lines.push(`- ${b.path}: ${b.responsibility || ''}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

export async function startMcpServer(): Promise<void> {
  const server = new Server(
    {
      name: 'ctx',
      version: '0.2.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'get_project_context',
          description: 'Get the full project context including architecture, conventions, and constraints. Use this when you need to understand how this codebase is structured.',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Optional path to search for .ctx directory. Defaults to current working directory.',
              },
            },
          },
        },
        {
          name: 'get_conventions',
          description: 'Get the coding conventions for this project (naming, formatting, imports). Use this when writing new code to match existing style.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_architecture',
          description: 'Get the architecture patterns and structure. Use this when adding new features to follow established patterns.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_constraints',
          description: 'Get the constraints and rules for this project. Use this to understand what NOT to do.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'find_files',
          description: 'Search the file index for files matching keywords. Use this to find relevant files for a task.',
          inputSchema: {
            type: 'object',
            properties: {
              keywords: {
                type: 'array',
                items: { type: 'string' },
                description: 'Keywords to search for (e.g., ["auth", "login", "user"])',
              },
            },
            required: ['keywords'],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const ctxPath = findCtxDir();

    if (!ctxPath) {
      return {
        content: [
          {
            type: 'text',
            text: 'No .ctx directory found. Run "ctx scan" first to analyze the codebase.',
          },
        ],
      };
    }

    const context = loadCtxContext(ctxPath);
    if (!context) {
      return {
        content: [
          {
            type: 'text',
            text: 'Failed to load .ctx context. Files may be corrupted. Run "ctx scan" to regenerate.',
          },
        ],
      };
    }

    switch (request.params.name) {
      case 'get_project_context': {
        const formatted = formatContextForAI(context);
        return {
          content: [{ type: 'text', text: formatted }],
        };
      }

      case 'get_conventions': {
        return {
          content: [
            {
              type: 'text',
              text: YAML.stringify(context.conventions),
            },
          ],
        };
      }

      case 'get_architecture': {
        return {
          content: [
            {
              type: 'text',
              text: YAML.stringify(context.architecture),
            },
          ],
        };
      }

      case 'get_constraints': {
        if (!context.constraints) {
          return {
            content: [
              {
                type: 'text',
                text: 'No constraints found. Run "ctx scan --local-ai --model <model>" to generate AI constraints.',
              },
            ],
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: YAML.stringify(context.constraints),
            },
          ],
        };
      }

      case 'find_files': {
        const args = request.params.arguments as { keywords?: string[] };
        const keywords = args.keywords || [];

        if (!context.index) {
          return {
            content: [
              {
                type: 'text',
                text: 'No file index found. Run "ctx scan" to generate the index.',
              },
            ],
          };
        }

        const index = context.index as {
          keywords?: Record<string, string[]>;
        };

        if (!index.keywords) {
          return {
            content: [{ type: 'text', text: 'Index has no keywords.' }],
          };
        }

        const matchedFiles = new Set<string>();
        for (const keyword of keywords) {
          const lowerKeyword = keyword.toLowerCase();
          for (const [indexKeyword, files] of Object.entries(index.keywords)) {
            if (indexKeyword.includes(lowerKeyword) || lowerKeyword.includes(indexKeyword)) {
              files.forEach(f => matchedFiles.add(f));
            }
          }
        }

        if (matchedFiles.size === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No files found matching: ${keywords.join(', ')}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Files matching "${keywords.join(', ')}":\n${[...matchedFiles].slice(0, 20).join('\n')}`,
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${request.params.name}`,
            },
          ],
        };
    }
  });

  // List resources (the .ctx files)
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const ctxPath = findCtxDir();

    if (!ctxPath) {
      return { resources: [] };
    }

    const resources = [];
    const files = ['manifest.yaml', 'conventions.yaml', 'architecture.yaml', 'constraints.yaml', 'index.yaml'];

    for (const file of files) {
      const filePath = path.join(ctxPath, file);
      if (fs.existsSync(filePath)) {
        resources.push({
          uri: `ctx://${file}`,
          name: file,
          mimeType: 'application/yaml',
          description: `ctx ${file.replace('.yaml', '')} configuration`,
        });
      }
    }

    return { resources };
  });

  // Read resources
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const ctxPath = findCtxDir();

    if (!ctxPath) {
      throw new Error('No .ctx directory found');
    }

    const uri = request.params.uri;
    const fileName = uri.replace('ctx://', '');
    const filePath = path.join(ctxPath, fileName);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Resource not found: ${fileName}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    return {
      contents: [
        {
          uri,
          mimeType: 'application/yaml',
          text: content,
        },
      ],
    };
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so it doesn't interfere with MCP protocol on stdout
  console.error('ctx MCP server running');
}
