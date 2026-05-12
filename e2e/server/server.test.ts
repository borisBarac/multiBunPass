import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OutputWrapper } from "../../src/out_stream";
import { MultiBunPassClient, type VM } from "../../src/cli_wrapper";
import {
	getStepResults,
	printSummary,
	resetStepResults,
	setupVM,
	step,
	VM_SERVER,
} from "../helpers";

const VM_NAME = Bun.env.E2E_VM_NAME || VM_SERVER;
const CLEANUP = Bun.env.E2E_CLEANUP === "true";
const STREAM_PORT = Number(Bun.env.E2E_STREAM_PORT) || 19876;
const SERVER_PORT = 3000;

const FIXTURE_PATH = join(import.meta.dir, "fixtures", "server.ts");

let client: MultiBunPassClient;
let tmpDir: string;
let vm: VM;

describe("E2E: Bun server in VM", () => {
	beforeAll(() => {
		console.log(`\n VM: ${VM_NAME}`);
		console.log(` Stream port: ${STREAM_PORT}`);
		console.log(` Server port: ${SERVER_PORT}`);
		console.log(` Cleanup: ${CLEANUP}`);
		console.log("");
	});

	afterAll(() => {
		printSummary();
	});

	test(
		"server scenario",
		async () => {
			resetStepResults();
			await step(
				"setup: create temp dir and copy server fixture",
				{ critical: true },
				async () => {
					tmpDir = `${tmpdir()}/multibunpass-server-${Date.now()}`;
					mkdirSync(tmpDir, { recursive: true });
					copyFileSync(FIXTURE_PATH, join(tmpDir, "server.ts"));
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
				vm = await setupVM(client, VM_NAME, tmpDir);
				console.log(`    vm.name=${vm.name}`);
			});

			await step("verify server.ts exists on VM", async () => {
				const result = await vm.exec("ls server.ts");
				expect(result.exitCode).toBe(0);
				expect(result.stdout.trim()).toContain("server.ts");
				console.log(`    found: ${result.stdout.trim()}`);
			});

			// vm.exec(`setsid bun run server.ts > /tmp/server.log 2>&1 < /dev/null &`);

			await step(
				"start Bun server in background",
				{ timeout: 15_000 },
				async () => {
					const _ = vm.exec(
						`setsid bun --hot run server.ts > /tmp/server.log 2>&1 < /dev/null &`,
					);
					// expect(result.exitCode).toBe(0);
				},
			);

			await step("wait for server ready", async () => {
				const maxAttempts = 20;
				const delayMs = 500;
				for (let i = 0; i < maxAttempts; i++) {
					try {
						const check = await vm.exec(
							`curl -s -o /dev/null -w '%{http_code}' http://localhost:${SERVER_PORT}/`,
						);
						if (check.stdout.trim() === "200") {
							console.log(`    server ready after ${(i + 1) * delayMs}ms`);
							return;
						}
					} catch {}
					await Bun.sleep(delayMs);
				}
				throw new Error(`server not ready after ${maxAttempts * delayMs}ms`);
			});

			let vmIp = "";
			await step("get VM IP address", async () => {
				const info = await client.info(VM_NAME);
				expect(info.ipv4.length).toBeGreaterThan(0);
				vmIp = info.ipv4[0]!;
				console.log(`    ip=${vmIp} (all: ${info.ipv4.join(", ")})`);
			});

			await step("HTTP fetch from host to VM server", async () => {
				const url = `http://${vmIp}:${SERVER_PORT}/`;
				console.log(`    fetching ${url}`);
				const res = await fetch(url);
				expect(res.status).toBe(200);
				const body = await res.text();
				expect(body).toBe("Hello from MultiBunPass!");
				console.log(`    response: "${body}"`);
			});

			await step(
				"detect: host curl without stream port and verify stdout",
				async () => {
					const result = await vm.exec(
						`curl -s http://${vmIp}:${SERVER_PORT}/`,
					);
					expect(result.exitCode).toBe(0);
					expect(result.stdout).toContain("Hello from MultiBunPass!");
					console.log(`    exec stdout (no stream): "${result.stdout.trim()}"`);
				},
			);

			await step(
				"streaming: host curl via OutputWrapper and verify TCP data",
				async () => {
					let tcpData = "";
					const server = Bun.listen({
						hostname: "127.0.0.1",
						port: STREAM_PORT,
						socket: {
							data(_socket, chunk) {
								tcpData += Buffer.from(chunk).toString();
							},
							open() {},
							close() {},
							error() {},
						},
					});

					const wrapper = new OutputWrapper({ port: STREAM_PORT });
					await wrapper.start();

					const result = await wrapper.spawnAndWrap([
						"curl",
						"-s",
						`http://${vmIp}:${SERVER_PORT}/`,
					]);

					await Bun.sleep(100);
					await wrapper.close();
					server.stop();
					expect(result.exitCode).toBe(0);
					expect(result.stdout).toContain("Hello from MultiBunPass!");
					expect(tcpData).toContain("Hello from MultiBunPass!");
					console.log(`    TCP received ${tcpData.length} bytes`);
					console.log(`    exec stdout: "${result.stdout.trim()}"`);
				},
			);

			await step("kill server process", async () => {
				await vm.exec("pkill -x bun || true", { skipPreflight: true });
				await Bun.sleep(500);
				console.log(`    server process killed`);
			});

			await step("verify server stopped", async () => {
				const result = await vm.exec(
					`curl -s -o /dev/null -w '%{http_code}' http://localhost:${SERVER_PORT}/ --max-time 2 || echo "failed"`,
				);
				const code = result.stdout.trim();
				expect(
					code === "000" || code === "failed" || !code.startsWith("2"),
				).toBe(true);
				console.log(`    curl exit: ${code}`);
			});

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
