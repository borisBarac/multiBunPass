import type { McpServer } from "@modelcontextprotocol/server";
import type { MultiBunPassClient } from "../../cli_wrapper/client";
import type { ExecResult } from "../../cli_wrapper/types";
import { ExecVMSchema } from "../schemas";

export function registerExecTool(
	server: McpServer,
	client: MultiBunPassClient,
): void {
	server.registerTool(
		"vm_exec",
		{
			description:
				"Run a shell command inside a VM. Commands run in the project directory by default (~/app/). Returns stdout, stderr, exit code, and a timedOut flag if the command exceeded the timeout.",
			inputSchema: ExecVMSchema,
		},
		async ({ name, command, localPath, remotePath, timeout }) => {
			let timedOut = false;

			try {
				const vm = localPath
					? await client.get(name, localPath, remotePath)
					: client.getUnsafe(name, "", remotePath);

				const execPromise = vm.exec(command, { skipPreflight: !localPath });

				const timeoutPromise = Bun.sleep(timeout * 1000).then(() => {
					timedOut = true;
				});

				const result = (await Promise.race([execPromise, timeoutPromise])) as
					| ExecResult
					| undefined;

				if (timedOut || !result) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										stdout: "",
										stderr: `Command timed out after ${timeout}s`,
										exitCode: -1,
										timedOut: true,
									},
									null,
									2,
								),
							},
						],
					};
				}

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									stdout: result.stdout,
									stderr: result.stderr,
									exitCode: result.exitCode,
									timedOut: false,
								},
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
