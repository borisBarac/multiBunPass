import type { McpServer } from "@modelcontextprotocol/server";
import type { MultiBunPassClient } from "../../cli_wrapper/client";
import { SyncVMSchema } from "../schemas";

export function registerSyncTool(
	server: McpServer,
	client: MultiBunPassClient,
): void {
	server.registerTool(
		"vm_sync",
		{
			description:
				"Re-transfer local project code to a running VM. Clears the remote directory first, then copies the local folder contents. The VM must already exist.",
			inputSchema: SyncVMSchema,
		},
		async ({ name, folderPath, remotePath }) => {
			try {
				const vm = client.get(name, folderPath, remotePath);
				await vm.resync();
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
}
