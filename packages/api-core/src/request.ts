import { z } from "zod";

export const ChatRequestSchema = z.object({
  question: z.string().trim().min(1).max(500),
  language: z.enum(["zh", "en"]),
  category: z.string().trim().min(1).max(80).optional()
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export async function parseChatRequest(request: Request): Promise<ChatRequest> {
  return ChatRequestSchema.parse(await request.json());
}
