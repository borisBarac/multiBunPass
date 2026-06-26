import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/server";
import { MultiBunPassClient } from "../../src/cli_wrapper";
import {
	getStepResults,
	printSummary,
	resetStepResults,
	setupVM,
	step,
	VM_LIFECYCLE,
} from "../helpers";

type JsonRpcResponse = {
	jsonrpc: "2.0";
	id: number;
	result?: unknown;
	error?: {
		code: number;
		message: string;
		data?: unknown;
	};
};

type PendingRequest = {
	resolve: (response: JsonRpcResponse) => void;
	reject: (error: Error) => void;
};

type ToolListResult = {
	tools?: { name?: string }[];
};

type ToolCallResult = {
	content?: { type?: string; text?: string }[];
	isError?: boolean;
};

const VM_NAME = Bun.env.E2E_VM_NAME || VM_LIFECYCLE;
const CLEANUP = Bun.env.E2E_CLEANUP === "true";
const decoder = new TextDecoder();
let client: MultiBunPassClient;
let tmpDir: string;

class McpStdioClient {
	private readonly proc: Bun.Subprocess<"pipe", "pipe", "pipe">;
	private readonly pending = new Map<number, PendingRequest>();
	private nextId = 1;
	private stdoutBuffer = "";

	constructor() {
		this.proc = Bun.spawn(["bun", "src/mcp/index.ts"], {
			cwd: process.cwd(),
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
			env: { ...Bun.env, LOG_LEVEL: "silent" },
		});
		void this.readStdout();
		void this.readStderr();
	}

	async initialize(): Promise<void> {
		await this.request("initialize", {
			protocolVersion: LATEST_PROTOCOL_VERSION,
			capabilities: {},
			clientInfo: { name: "multibunpass-e2e", version: "0.0.0" },
		});
		this.notification("notifications/initialized");
	}

	async request(
		method: string,
		params?: Record<string, unknown>,
	): Promise<unknown> {
		const id = this.nextId++;
		const responsePromise = new Promise<JsonRpcResponse>((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
		});

		this.send({ jsonrpc: "2.0", id, method, params });

		const timeoutPromise = Bun.sleep(30_000).then(() => {
			this.pending.delete(id);
			throw new Error(`MCP request "${method}" timed out`);
		});

		const response = await Promise.race([responsePromise, timeoutPromise]);
		if (response.error) {
			throw new Error(
				`MCP request "${method}" failed: ${response.error.message}`,
			);
		}
		return response.result;
	}

	notification(method: string, params?: Record<string, unknown>): void {
		this.send({ jsonrpc: "2.0", method, params });
	}

	async close(): Promise<void> {
		for (const pending of this.pending.values()) {
			pending.reject(new Error("MCP client closed"));
		}
		this.pending.clear();
		this.proc.kill();
		await Promise.race([this.proc.exited, Bun.sleep(2_000)]);
	}

	private send(message: Record<string, unknown>): void {
		this.proc.stdin.write(`${JSON.stringify(message)}\n`);
	}

	private async readStdout(): Promise<void> {
		const stream = this.proc.stdout;
		if (!stream) {
			return;
		}

		const reader = stream.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			this.stdoutBuffer += decoder.decode(value, { stream: true });
			this.drainMessages();
		}
	}

	private async readStderr(): Promise<void> {
		const stream = this.proc.stderr;
		if (!stream) {
			return;
		}

		const reader = stream.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			process.stderr.write(decoder.decode(value, { stream: true }));
		}
	}

	private drainMessages(): void {
		while (true) {
			const lineEnd = this.stdoutBuffer.indexOf("\n");
			if (lineEnd === -1) {
				return;
			}

			const rawBody = this.stdoutBuffer.slice(0, lineEnd).replace(/\r$/, "");
			this.stdoutBuffer = this.stdoutBuffer.slice(lineEnd + 1);
			if (!rawBody) {
				continue;
			}
			const message = JSON.parse(rawBody) as Partial<JsonRpcResponse>;
			if (typeof message.id !== "number") {
				continue;
			}

			const pending = this.pending.get(message.id);
			if (!pending) {
				continue;
			}

			this.pending.delete(message.id);
			pending.resolve(message as JsonRpcResponse);
		}
	}
}

function asToolListResult(value: unknown): ToolListResult {
	return value as ToolListResult;
}

function asToolCallResult(value: unknown): ToolCallResult {
	return value as ToolCallResult;
}

function parseToolTextJson(value: unknown): unknown {
	const result = asToolCallResult(value);
	const text = result.content?.find((item) => item.type === "text")?.text;
	if (!text) {
		throw new Error("MCP tool response did not include text content");
	}
	return JSON.parse(text);
}

describe("E2E: MCP stdio server", () => {
	beforeAll(() => {
		console.log(`\n VM: ${VM_NAME}`);
		console.log(` Cleanup: ${CLEANUP}`);
		console.log("");
	});

	afterAll(() => {
		printSummary();
	});

	test(
		"mcp protocol scenario",
		async () => {
			resetStepResults();
			await step(
				"setup: create temp dir with MCP sample files",
				{ critical: true },
				async () => {
					tmpDir = `${tmpdir()}/multibunpass-mcp-e2e-${Date.now()}`;
					mkdirSync(tmpDir, { recursive: true });
					writeFileSync(
						join(tmpDir, "package.json"),
						JSON.stringify(
							{ name: "mcp-e2e-test", version: "1.0.0" },
							null,
							"\t",
						),
					);
					writeFileSync(join(tmpDir, "mcp.txt"), "initial mcp content\n");
					console.log(`    temp dir: ${tmpDir}`);
				},
			);

			await step(
				"setup: create MultiBunPassClient",
				{ critical: true },
				async () => {
					client = new MultiBunPassClient();
				},
			);

			await step("create or reuse VM", { critical: true }, async () => {
				await setupVM(client, VM_NAME, tmpDir);
			});

			const mcp = new McpStdioClient();
			try {
				await step("initialize MCP server over stdio", async () => {
					await mcp.initialize();
				});

				await step("tools/list exposes expected VM tools", async () => {
					const result = asToolListResult(await mcp.request("tools/list"));
					const toolNames = new Set(result.tools?.map((tool) => tool.name));
					for (const name of [
						"vm_list",
						"vm_create",
						"vm_delete",
						"vm_info",
						"vm_start",
						"vm_stop",
						"vm_status",
						"vm_exec",
						"vm_sync",
					]) {
						expect(toolNames.has(name)).toBe(true);
					}
					console.log(`    tools: ${[...toolNames].join(", ")}`);
				});

				await step("vm_list returns the e2e VM", async () => {
					const result = await mcp.request("tools/call", {
						name: "vm_list",
						arguments: {},
					});
					const vms = parseToolTextJson(result) as { name?: string }[];
					expect(vms.some((vm) => vm.name === VM_NAME)).toBe(true);
				});

				await step("vm_exec runs a command inside the VM", async () => {
					const result = await mcp.request("tools/call", {
						name: "vm_exec",
						arguments: {
							name: VM_NAME,
							localPath: tmpDir,
							command: "cat mcp.txt",
							timeout: 30,
						},
					});
					const execResult = parseToolTextJson(result) as {
						stdout?: string;
						exitCode?: number;
						timedOut?: boolean;
					};
					expect(execResult.exitCode).toBe(0);
					expect(execResult.timedOut).toBe(false);
					expect(execResult.stdout).toContain("initial mcp content");
				});

				await step("vm_sync updates files through MCP", async () => {
					writeFileSync(join(tmpDir, "mcp.txt"), "updated mcp content\n");

					const syncResult = await mcp.request("tools/call", {
						name: "vm_sync",
						arguments: {
							name: VM_NAME,
							localPath: tmpDir,
						},
					});
					const syncPayload = parseToolTextJson(syncResult) as {
						success?: boolean;
						name?: string;
					};
					expect(syncPayload.success).toBe(true);
					expect(syncPayload.name).toBe(VM_NAME);

					const execResult = await mcp.request("tools/call", {
						name: "vm_exec",
						arguments: {
							name: VM_NAME,
							localPath: tmpDir,
							command: "cat mcp.txt",
							timeout: 30,
						},
					});
					const execPayload = parseToolTextJson(execResult) as {
						stdout?: string;
						exitCode?: number;
					};
					expect(execPayload.exitCode).toBe(0);
					expect(execPayload.stdout).toContain("updated mcp content");
				});
			} finally {
				await mcp.close();
			}

			if (CLEANUP) {
				await step("cleanup: remove temp dir", async () => {
					rmSync(tmpDir, { recursive: true, force: true });
				});
			} else {
				console.log("  ⏭ cleanup skipped (E2E_CLEANUP=false)");
			}

			const results = getStepResults();
			const failed = results.filter((r) => !r.ok);
			if (failed.length > 0) {
				console.log(
					`\n  ${failed.length} step(s) failed: ${failed.map((f) => f.step).join(", ")}`,
				);
			}
			expect(failed.length).toBe(0);
		},
		{ timeout: 60_000 },
	);
});
