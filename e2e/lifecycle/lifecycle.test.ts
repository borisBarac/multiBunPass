import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MultiBunPassClient } from "../../src/cli_wrapper";
import {
	getStepResults,
	printSummary,
	resetStepResults,
	setupVM,
	step,
	VM_LIFECYCLE,
} from "../helpers";

const VM_NAME = Bun.env.E2E_VM_NAME || VM_LIFECYCLE;
const CLEANUP = Bun.env.E2E_CLEANUP === "true";
const STREAM_PORT = Number(Bun.env.E2E_STREAM_PORT) || 19876;

let client: MultiBunPassClient;
let tmpDir: string;

describe("E2E: Full MultiBunPass lifecycle", () => {
	beforeAll(() => {
		console.log(`\n VM: ${VM_NAME}`);
		console.log(` Stream port: ${STREAM_PORT}`);
		console.log(` Cleanup: ${CLEANUP}`);
		console.log("");
	});

	afterAll(() => {
		printSummary();
	});

	test(
		"full scenario",
		async () => {
			resetStepResults();
			await step(
				"setup: create temp dir with sample files",
				{ critical: true },
				async () => {
					tmpDir = `${tmpdir()}/multibunpass-e2e-${Date.now()}`;
					mkdirSync(tmpDir, { recursive: true });
					writeFileSync(
						join(tmpDir, "index.ts"),
						'console.log("hello from e2e");\n',
					);
					writeFileSync(
						join(tmpDir, "package.json"),
						JSON.stringify({ name: "e2e-test", version: "1.0.0" }, null, "\t"),
					);
					writeFileSync(join(tmpDir, "hello.txt"), "initial content\n");
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

			await step("list includes new VM", async () => {
				const vms = await client.list();
				const found = vms.find((v) => v.name === VM_NAME);
				expect(found).toBeDefined();
				expect(found?.state).toBe("Running");
				console.log(`    state=${found?.state} ipv4=${found?.ipv4.join(", ")}`);
			});

			await step("info returns valid details", async () => {
				const info = await client.info(VM_NAME);
				expect(info.name).toBe(VM_NAME);
				expect(info.state).toBe("Running");
				expect(info.cpu_count).toBeGreaterThan(0);
				expect(info.disk.total).toBeTruthy();
				expect(info.memory.total).toBeTruthy();
				console.log(
					`    cpu=${info.cpu_count} disk=${info.disk.used}/${info.disk.total} mem=${info.memory.used}/${info.memory.total}`,
				);
			});

			{
				const vm = await client.get(VM_NAME, tmpDir);

				await step("exec: bun --version", async () => {
					const result = await vm.exec("bun --version");
					expect(result.exitCode).toBe(0);
					expect(result.stdout.trim()).toMatch(/^\d+\.\d+/);
					console.log(`    bun ${result.stdout.trim()}`);
				});

				await step("exec: verify transferred files exist", async () => {
					const result = await vm.exec("ls");
					expect(result.exitCode).toBe(0);
					expect(result.stdout).toContain("index.ts");
					expect(result.stdout).toContain("package.json");
					expect(result.stdout).toContain("hello.txt");
					console.log(
						`    files: ${result.stdout.trim().replace(/\n/g, ", ")}`,
					);
				});

				await step("exec: verify file content", async () => {
					const result = await vm.exec("cat hello.txt");
					expect(result.exitCode).toBe(0);
					expect(result.stdout).toContain("initial content");
				});

				await step("remotePath is accessible on the VM instance", async () => {
					expect(vm.remotePath).toBe("~/app/");
				});

				await step("stop VM", async () => {
					const result = await vm.stop();
					expect(result.exitCode).toBe(0);
				});

				await step("start VM", async () => {
					const result = await vm.start();
					expect(result.exitCode).toBe(0);
				});

				await step("pushFiles: modify local file and re-transfer", async () => {
					writeFileSync(join(tmpDir, "hello.txt"), "updated content\n");
					writeFileSync(join(tmpDir, "new-file.txt"), "I am new\n");

					await vm.pushFiles();

					const catResult = await vm.exec("cat hello.txt");
					expect(catResult.stdout).toContain("updated content");

					const lsResult = await vm.exec("cat new-file.txt");
					expect(lsResult.stdout).toContain("I am new");
					console.log(`    hello.txt now: "${catResult.stdout.trim()}"`);
				});
			}

			await step(
				"exec with stream: bun --version via OutputWrapper",
				async () => {
					const server = Bun.listen({
						hostname: "localhost",
						port: STREAM_PORT,
						socket: {
							data() {},
							open() {},
							close() {},
							error() {},
						},
					});

					const vm = await client.get(VM_NAME, tmpDir);
					const result = await vm.exec("bun --version", {
						streamPort: STREAM_PORT,
					});
					server.stop();
					expect(result.exitCode).toBe(0);
					console.log(`    stdout: ${result.stdout.trim()}`);
				},
			);

			if (CLEANUP) {
				await step("cleanup: delete VM", async () => {
					await client.delete(VM_NAME);
					console.log(`    VM "${VM_NAME}" deleted and purged`);
				});

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
