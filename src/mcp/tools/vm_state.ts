import type { McpServer } from "@modelcontextprotocol/server";
import type { MultiBunPassClient } from "../../cli_wrapper/client";
import { StartVMSchema, StatusVMSchema, StopVMSchema } from "../schemas";

export function registerStateTools(
	server: McpServer,
	client: MultiBunPassClient,
): void {
	server.registerTool(
		"vm_start",
		{
			description: "Start a stopped VM.",
			inputSchema: StartVMSchema,
		},
		async ({ name }) => {
			try {
				const vm = client.get(name, "");
				await vm.start();
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({ success: true, name }),
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

	server.registerTool(
		"vm_stop",
		{
			description: "Stop a running VM.",
			inputSchema: StopVMSchema,
		},
		async ({ name }) => {
			try {
				const vm = client.get(name, "");
				await vm.stop();
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({ success: true, name }),
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

	server.registerTool(
		"vm_status",
		{
			description: "Check whether a VM is currently Running or Stopped.",
			inputSchema: StatusVMSchema,
		},
		async ({ name }) => {
			try {
				const vm = client.get(name, "");
				const running = await vm.isRunning();
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({ name, running }),
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
