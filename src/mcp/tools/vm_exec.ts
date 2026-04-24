import type { McpServer } from "@modelcontextprotocol/server";
import { ExecVMSchema } from "../schemas";

export function registerExecTool(server: McpServer): void {
	server.registerTool(
		"vm_exec",
		{
			description:
				"Run a shell command inside a VM. Returns stdout, stderr, exit code, and a timedOut flag if the command exceeded the timeout. Default timeout is 60 seconds.",
			inputSchema: ExecVMSchema,
		},
		async ({ name, command, timeout }) => {
			let timedOut = false;

			try {
				const proc = Bun.spawn(
					["multipass", "exec", name, "--", "bash", "-lc", command],
					{
						stdout: "pipe",
						stderr: "pipe",
					},
				);

				const stdoutChunks: Uint8Array[] = [];
				const stderrChunks: Uint8Array[] = [];

				const pipeStream = async (
					stream: ReadableStream<Uint8Array> | null,
					chunks: Uint8Array[],
				) => {
					if (!stream) return;
					const reader = stream.getReader();
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						chunks.push(value);
					}
				};

				const stdoutPromise = pipeStream(
					proc.stdout as ReadableStream<Uint8Array> | null,
					stdoutChunks,
				);
				const stderrPromise = pipeStream(
					proc.stderr as ReadableStream<Uint8Array> | null,
					stderrChunks,
				);

				const timeoutPromise = Bun.sleep(timeout * 1000).then(() => {
					timedOut = true;
					proc.kill();
				});

				await Promise.race([
					Promise.all([stdoutPromise, stderrPromise, proc.exited]),
					timeoutPromise,
				]);

				if (!timedOut) {
					await Promise.all([stdoutPromise, stderrPromise]);
				}

				const exitCode = await proc.exited;
				const stdout = Buffer.concat(stdoutChunks).toString();
				const stderr = Buffer.concat(stderrChunks).toString();

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{ stdout, stderr, exitCode, timedOut },
								null,
								2,
							),
						},
					],
				};
			} catch (err) {
				return {
					content: [{ type: "text", text: (err as Error).message }],
					isError: true,
				};
			}
		},
	);
}
