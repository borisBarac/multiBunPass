#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/server";
import { createServer } from "./server";

async function main() {
	const server = await createServer();
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch((err) => {
	process.stderr.write(`Fatal: ${err}\n`);
	process.exit(1);
});
