import type { McpServer } from "@modelcontextprotocol/server";
import type { MultiBunPassClient } from "../../cli_wrapper/client";
import {
	CreateVMSchema,
	DeleteVMSchema,
	InfoVMSchema,
	ListVMSchema,
} from "../schemas";

export function registerLifecycleTools(
	server: McpServer,
	client: MultiBunPassClient,
): void {
	server.registerTool(
		"vm_list",
		{
			description:
				"List all Multipass VMs. Returns name, state (Running/Stopped), IPv4 addresses, and image for each VM.",
			inputSchema: ListVMSchema,
		},
		async () => {
			try {
				const vms = await client.list();
				return {
					content: [{ type: "text", text: JSON.stringify(vms, null, 2) }],
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
		"vm_create",
		{
			description:
				"Launch a new Multipass VM with Bun pre-installed via cloud-init, then transfer a local project folder into it. Returns once the VM is fully provisioned and code is in place.",
			inputSchema: CreateVMSchema,
		},
		async ({ name, folderPath, remotePath }) => {
			try {
				await client.create(name, folderPath, remotePath);
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
		"vm_delete",
		{
			description:
				"Permanently delete and purge a Multipass VM. This is irreversible.",
			inputSchema: DeleteVMSchema,
		},
		async ({ name }) => {
			try {
				await client.delete(name);
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
		"vm_info",
		{
			description:
				"Get detailed info about a VM: CPU count, memory usage, disk usage, IP addresses, release, mounts, load.",
			inputSchema: InfoVMSchema,
		},
		async ({ name }) => {
			try {
				const info = await client.info(name);
				return {
					content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
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
