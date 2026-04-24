import { McpServer } from "@modelcontextprotocol/server";
import { MultiBunPassClient } from "../cli_wrapper/client";
import { registerExecTool } from "./tools/vm_exec";
import { registerLifecycleTools } from "./tools/vm_lifecycle";
import { registerStateTools } from "./tools/vm_state";
import { registerSyncTool } from "./tools/vm_sync";

export async function createServer(): Promise<McpServer> {
	const client = new MultiBunPassClient();
	const server = new McpServer({ name: "multibunpass", version: "1.0.0" });

	registerLifecycleTools(server, client);
	registerStateTools(server, client);
	registerExecTool(server);
	registerSyncTool(server, client);

	return server;
}
