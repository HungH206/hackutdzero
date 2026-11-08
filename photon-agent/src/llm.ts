import { GoogleGenAI } from '@google/genai';

export interface LlmRequest {
  system: string;
  user: string;
  schema?: object;
  timeoutMs: number;
}

/** Returns null on any failure, so every caller has to have a way to carry on without the model. */
export type Llm = (request: LlmRequest) => Promise<string | null>;

export function geminiLlm(apiKey: string, model: string): Llm {
  const client = new GoogleGenAI({ apiKey });
  return async ({ system, user, schema, timeoutMs }) => {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs);
      });
      const call = client.interactions.create({
        model,
        input: user,
        system_instruction: system,
        store: false,
        generation_config: { thinking_level: 'low' },
        ...(schema ? { response_format: { type: 'text', mime_type: 'application/json', schema } } : {}),
      } as Parameters<typeof client.interactions.create>[0]);
      const interaction = await Promise.race([call, timeout]) as { output_text?: string };
      return interaction.output_text?.trim() || null;
    } catch (error) {
      console.warn('Gemini unavailable:', error instanceof Error ? error.message : error);
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
}
