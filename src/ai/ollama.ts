const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
}

export interface OllamaClient {
  ping(): Promise<boolean>;
  listModels(): Promise<OllamaModel[]>;
  embed(model: string, text: string): Promise<number[]>;
  embedBatch(model: string, texts: string[]): Promise<number[][]>;
  generate(model: string, prompt: string, options?: GenerateOptions): Promise<string>;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  system?: string;
}

async function fetchOllama(endpoint: string, options?: RequestInit): Promise<Response> {
  const url = `${OLLAMA_HOST}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  return response;
}

export async function ping(): Promise<boolean> {
  try {
    const response = await fetchOllama('/api/tags');
    return response.ok;
  } catch {
    return false;
  }
}

export async function listModels(): Promise<OllamaModel[]> {
  const response = await fetchOllama('/api/tags');
  if (!response.ok) {
    throw new Error(`Failed to list models: ${response.statusText}`);
  }
  const data = await response.json() as { models: OllamaModel[] };
  return data.models || [];
}

export async function hasModel(modelName: string): Promise<boolean> {
  const models = await listModels();
  return models.some(m => m.name === modelName || m.name.startsWith(modelName + ':'));
}

export async function embed(model: string, text: string): Promise<number[]> {
  const response = await fetchOllama('/api/embed', {
    method: 'POST',
    body: JSON.stringify({
      model,
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding failed: ${error}`);
  }

  const data = await response.json() as { embeddings: number[][] };
  return data.embeddings[0];
}

export async function embedBatch(model: string, texts: string[]): Promise<number[][]> {
  const response = await fetchOllama('/api/embed', {
    method: 'POST',
    body: JSON.stringify({
      model,
      input: texts,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Batch embedding failed: ${error}`);
  }

  const data = await response.json() as { embeddings: number[][] };
  return data.embeddings;
}

export async function generate(
  model: string,
  prompt: string,
  options: GenerateOptions = {}
): Promise<string> {
  const response = await fetchOllama('/api/generate', {
    method: 'POST',
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.1,
        num_predict: options.maxTokens ?? 2000,
      },
      system: options.system,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Generation failed: ${error}`);
  }

  const data = await response.json() as { response: string };
  return data.response;
}

export type StreamCallback = (tokenCount: number, done: boolean) => void;

export async function generateWithProgress(
  model: string,
  prompt: string,
  options: GenerateOptions = {},
  onProgress?: StreamCallback
): Promise<string> {
  const response = await fetchOllama('/api/generate', {
    method: 'POST',
    body: JSON.stringify({
      model,
      prompt,
      stream: true,
      options: {
        temperature: options.temperature ?? 0.1,
        num_predict: options.maxTokens ?? 2000,
      },
      system: options.system,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Generation failed: ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let result = '';
  let tokenCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter(line => line.trim());

    for (const line of lines) {
      try {
        const data = JSON.parse(line) as { response?: string; done?: boolean };
        if (data.response) {
          result += data.response;
          tokenCount++;
          if (onProgress) {
            onProgress(tokenCount, false);
          }
        }
        if (data.done && onProgress) {
          onProgress(tokenCount, true);
        }
      } catch {
        // Skip invalid JSON lines
      }
    }
  }

  return result;
}

export function getOllamaHost(): string {
  return OLLAMA_HOST;
}

export async function checkConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const isRunning = await ping();
    if (!isRunning) {
      return {
        ok: false,
        error: `Ollama not running at ${OLLAMA_HOST}. Start with: ollama serve`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `Cannot connect to Ollama at ${OLLAMA_HOST}: ${err}`,
    };
  }
}

export async function validateModel(modelName: string): Promise<{ ok: boolean; error?: string }> {
  const exists = await hasModel(modelName);
  if (!exists) {
    const models = await listModels();
    const available = models.map(m => m.name).join(', ');
    return {
      ok: false,
      error: `Model "${modelName}" not found. Pull with: ollama pull ${modelName}\nAvailable: ${available || 'none'}`,
    };
  }
  return { ok: true };
}
