import { z } from "zod";

const ConfigSchema = z.object({
  DG_CONNECTOR_TOKEN: z.string().min(32),
  DG_ALLOWED_EXTENSION_ID: z.string().regex(/^[a-p]{32}$/),
  DG_CAPTURE_ROOT: z.string().min(1).default("data/private/dragons-gate")
});

export function loadReceiverConfig(environment: NodeJS.ProcessEnv = process.env) {
  return ConfigSchema.parse(environment);
}

export function receiverListenOptions(port = 43117) {
  return [{ host: "127.0.0.1", port }, { host: "::1", port }];
}
