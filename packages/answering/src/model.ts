import OpenAI from "openai";
import { z } from "zod";

import { buildSystemInstructions, buildUntrustedUserInput } from "./prompt.js";
import type { GroundedModelInput, GroundedModelOutput, ModelClient } from "./types.js";

const GroundedModelOutputSchema = z.object({
  status: z.enum(["answered", "unknown", "conflict"]),
  answer: z.string(),
  citationIds: z.array(z.string())
});

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "answer", "citationIds"],
  properties: {
    status: { type: "string", enum: ["answered", "unknown", "conflict"] },
    answer: { type: "string" },
    citationIds: { type: "array", items: { type: "string" } }
  }
} as const;

export interface OpenAIModelEnvironment {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}

export function createOpenAIModelClient(
  environment: OpenAIModelEnvironment = process.env
): ModelClient {
  const apiKey = environment.OPENAI_API_KEY;
  const model = environment.OPENAI_MODEL;
  if (!apiKey || !model) {
    throw new Error("OPENAI_API_KEY and OPENAI_MODEL are required");
  }
  const client = new OpenAI({ apiKey });

  return {
    async generate(input: GroundedModelInput): Promise<GroundedModelOutput> {
      const response = await client.responses.create({
        model,
        instructions: buildSystemInstructions(input.language),
        input: buildUntrustedUserInput({ question: input.question, evidence: input.evidence }),
        store: false,
        max_output_tokens: 800,
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "grounded_isb_answer",
            strict: true,
            schema: responseSchema
          }
        }
      });

      return GroundedModelOutputSchema.parse(JSON.parse(response.output_text));
    }
  };
}
