import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MultiBunPassClient } from "../src/cli_wrapper";

const VM_NAME = Bun.env.E2E_VM_NAME || `mbp-e2e-${Date.now()}`;
const CLEANUP = Bun.env.E2E_CLEANUP === "true";
const STREAM_PORT = Number(Bun.env.E2E_STREAM_PORT) || 19876;
const E2E_REMOTE_PATH = "~/app/";

interface StepResult {
	step: string;
	ok: boolean;
	ms: number;
	err?: string;
}

const results: StepResult[] = [];
let client: MultiBunPassClient;
let tmpDir: string;
let vmConnected = false;

async function step(name: string, fn: () => Promise<void>): Promise<void>;
async function step(
	name: string,
	opts: { critical?: boolean },
	fn: () => Promise<void>,
): Promise<void>;
async function step(
	name: string,
	opts?: { critical?: boolean } | (() => Promise<void>),
	fn?: () => Promise<void>,
) {
	if (!fn) {
		fn = (opts as () => Promise<void>) ?? (async () => {});
		opts = undefined;
	}
	const start = performance.now();
	try {
		await fn();
		const ms = Math.round(performance.now() - start);
		results.push({ step: name, ok: true, ms });
		console.log(`  ✓ ${name} (${ms}ms)`);
	} catch (err) {
		const ms = Math.round(performance.now() - start);
		const msg = (err as Error).message;
		results.push({ step: name, ok: false, ms, err: msg });
		console.error(`  ✗ ${name} (${ms}ms): ${msg}`);
		if (opts?.critical) {
			console.error(`  ⛔ CRITICAL FAILURE — aborting scenario`);
			throw err;
		}
	}
}

function printSummary() {
	console.log("\n─────────────────────────────────────────");
	console.log("E2E Test Summary");
	console.log("─────────────────────────────────────────");
	const passed = results.filter((r) => r.ok).length;
	const failed = results.filter((r) => !r.ok).length;
	for (const r of results) {
		const icon = r.ok ? "✓" : "✗";
		const suffix = r.err ? ` — ${r.err.slice(0, 120)}` : "";
		console.log(`  ${icon} ${r.step} (${r.ms}ms)${suffix}`);
	}
	console.log(
		`\n  ${passed} passed, ${failed} failed out of ${results.length} steps`,
	);
	console.log("─────────────────────────────────────────");
}

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

	test("full scenario", async () => {
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

		await step("setup: create MultiBunPassClient", { critical: true }, async () => {
			client = new MultiBunPassClient();
		});

		await step("create or reuse VM", { critical: true }, async () => {
			const vms = await client.list();
			const existing = vms.find((v) => v.name === VM_NAME);

			if (existing) {
				console.log(
					`    VM "${VM_NAME}" already exists (state=${existing.state})`,
				);
				const vm = client.get(VM_NAME, tmpDir, E2E_REMOTE_PATH);
				if (existing.state !== "Running") {
					await vm.start();
				}
				await vm.resync();
			} else {
				console.log(`    VM "${VM_NAME}" not found, creating...`);
				await client.create(VM_NAME, tmpDir, E2E_REMOTE_PATH);
			}
			vmConnected = true;
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

		if (vmConnected) {
			const vm = client.get(VM_NAME, tmpDir, E2E_REMOTE_PATH);

			await step("exec: bun --version", async () => {
				const result = await vm.exec("bun --version");
				expect(result.exitCode).toBe(0);
				expect(result.stdout.trim()).toMatch(/^\d+\.\d+/);
				console.log(`    bun ${result.stdout.trim()}`);
			});

			await step("exec: verify transferred files exist", async () => {
				const result = await vm.exec("ls ~/app/");
				expect(result.exitCode).toBe(0);
				expect(result.stdout).toContain("index.ts");
				expect(result.stdout).toContain("package.json");
				expect(result.stdout).toContain("hello.txt");
				console.log(`    files: ${result.stdout.trim().replace(/\n/g, ", ")}`);
			});

			await step("exec: verify file content", async () => {
				const result = await vm.exec("cat ~/app/hello.txt");
				expect(result.exitCode).toBe(0);
				expect(result.stdout).toContain("initial content");
			});

			await step("getLocalPath returns correct remote path", async () => {
				expect(vm.getLocalPath()).toBe(E2E_REMOTE_PATH);
			});

			await step("stop VM", async () => {
				const result = await vm.stop();
				expect(result.exitCode).toBe(0);
			});

			await step("start VM", async () => {
				const result = await vm.start();
				expect(result.exitCode).toBe(0);
			});

			await step("resync: modify local file and re-transfer", async () => {
				writeFileSync(join(tmpDir, "hello.txt"), "updated content\n");
				writeFileSync(join(tmpDir, "new-file.txt"), "I am new\n");

				await vm.resync();

				const catResult = await vm.exec("cat ~/app/hello.txt");
				expect(catResult.stdout).toContain("updated content");

				const lsResult = await vm.exec("cat ~/app/new-file.txt");
				expect(lsResult.stdout).toContain("I am new");
				console.log(`    hello.txt now: "${catResult.stdout.trim()}"`);
			});
		} else {
			console.log("  ⏭ skipping VM-dependent steps (no VM)");
		}

		await step("exec with stream: bun --version via OutputWrapper", async () => {
			const vm = client.get(VM_NAME, tmpDir, E2E_REMOTE_PATH);
			const result = await vm.exec("bun --version", STREAM_PORT);
			expect(result.exitCode).toBe(0);
			console.log(`    stdout: ${result.stdout.trim()}`);
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

		const failed = results.filter((r) => !r.ok);
		if (failed.length > 0) {
			console.log(
				`\n  ${failed.length} step(s) failed: ${failed.map((f) => f.step).join(", ")}`,
			);
		}
		expect(failed.length).toBe(0);
	});
});
