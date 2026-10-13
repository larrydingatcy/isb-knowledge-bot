import { pathToFileURL } from "node:url";

interface CliDeps {
  status?: () => Promise<unknown>;
  preview?: (id: string) => Promise<unknown>;
  approve?: (id: string) => Promise<unknown>;
  publish?: (runId: string) => Promise<unknown>;
  discard?: (id: string) => Promise<unknown>;
  cleanup?: () => Promise<unknown>;
}
interface CliResult { exitCode: number; output: string }

export async function runDragonsGateCli(args: string[], deps: CliDeps): Promise<CliResult> {
  try {
    const [command, id] = args;
    if (command === "status" && deps.status) return { exitCode: 0, output: JSON.stringify(await deps.status()) };
    if (command === "preview" && id && deps.preview) return { exitCode: 0, output: JSON.stringify(await deps.preview(id)) };
    if (command === "approve" && id && deps.approve) return { exitCode: 0, output: JSON.stringify(await deps.approve(id)) };
    if (command === "publish" && id && deps.publish) return { exitCode: 0, output: JSON.stringify(await deps.publish(id)) };
    if (command === "discard" && id && deps.discard) return { exitCode: 0, output: JSON.stringify(await deps.discard(id)) };
    if (command === "cleanup" && deps.cleanup) return { exitCode: 0, output: JSON.stringify(await deps.cleanup()) };
    return { exitCode: 2, output: "Usage: dragons-gate status|preview <id>|approve <id>|publish <run-id>|discard <id>|cleanup" };
  } catch (error) { return { exitCode: 1, output: error instanceof Error ? error.message : String(error) }; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runDragonsGateCli(process.argv.slice(2), {
    status: async () => ({ receiver: "not-installed", extension: "load local/dragons-gate/extension/dist" })
  });
  console.log(result.output);
  process.exitCode = result.exitCode;
}
