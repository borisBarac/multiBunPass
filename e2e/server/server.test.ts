import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MultiBunPassClient } from "../../src/cli_wrapper";
import {
	getStepResults,
	printSummary,
	resetStepResults,
	setupVM,
	step,
} from "../helpers";

const VM_NAME = Bun.env.E2E_VM_NAME || `mbp-server-${Date.now()}`;
const CLEANUP = Bun.env.E2E_CLEANUP === "true";
const STREAM_PORT = Number(Bun.env.E2E_STREAM_PORT) || 19876;
const SERVER_PORT = 3000;
const E2E_REMOTE_PATH = "~/app/";

const FIXTURE_PATH = join(import.meta.dir, "fixtures", "server.ts");

let client: MultiBunPassClient;
let tmpDir: string;
let vm: ReturnType<MultiBunPassClient["get"]>;

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

	test("server scenario", async () => {
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
			vm = await setupVM(client, VM_NAME, tmpDir, E2E_REMOTE_PATH);
			console.log(`    vm.name=${vm.name}`);
		});

		await step("verify server.ts exists on VM", async () => {
			const result = await vm.exec("ls ~/app/server.ts");
			expect(result.exitCode).toBe(0);
			expect(result.stdout.trim()).toContain("server.ts");
			console.log(`    found: ${result.stdout.trim()}`);
		});

		await step("start Bun server in background", async () => {
			const result = await vm.exec(
				`nohup bun run ~/app/server.ts > /tmp/server.log 2>&1 & echo $!`,
			);
			expect(result.exitCode).toBe(0);
			console.log(`    pid: ${result.stdout.trim()}`);
		});

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
			"streaming: exec curl via OutputWrapper and verify TCP data",
			async () => {
				const execPromise = vm.exec(
					`curl -s http://localhost:${SERVER_PORT}/ && sleep 0.5`,
					STREAM_PORT,
				);

				const tcpData = await new Promise<string>((resolve, reject) => {
					const deadline = setTimeout(
						() => reject(new Error("TCP connection timeout")),
						15000,
					);
					let data = "";

					const tryConnect = (attempt: number) => {
						Bun.connect({
							hostname: "127.0.0.1",
							port: STREAM_PORT,
							socket: {
								data(_socket, chunk) {
									data += Buffer.from(chunk).toString();
								},
								open() {},
								close() {
									clearTimeout(deadline);
									resolve(data);
								},
								error(_socket, err) {
									if (attempt < 100) {
										setTimeout(() => tryConnect(attempt + 1), 30);
									} else {
										clearTimeout(deadline);
										reject(err);
									}
								},
							},
						}).catch(() => {
							if (attempt < 100) {
								setTimeout(() => tryConnect(attempt + 1), 30);
							} else {
								clearTimeout(deadline);
								reject(new Error("TCP connect failed after 100 retries"));
							}
						});
					};
					tryConnect(0);
				});

				const result = await execPromise;
				expect(result.exitCode).toBe(0);
				expect(result.stdout).toContain("Hello from MultiBunPass!");
				expect(tcpData.length).toBeGreaterThan(0);
				console.log(`    TCP received ${tcpData.length} bytes`);
				console.log(`    exec stdout: "${result.stdout.trim()}"`);
			},
		);

		await step("kill server process", async () => {
			try {
				await vm.exec("pkill -f 'bun.*server.ts'");
			} catch {}
			await Bun.sleep(500);
			console.log(`    server process killed`);
		});

		await step("verify server stopped", async () => {
			const result = await vm.exec(
				`curl -s -o /dev/null -w '%{http_code}' http://localhost:${SERVER_PORT}/ --max-time 2 || echo "failed"`,
			);
			const code = result.stdout.trim();
			expect(code === "000" || code === "failed" || !code.startsWith("2")).toBe(
				true,
			);
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
	});
});
