import { execMultipass } from "../src/cli_wrapper/cli";
import type { MultiBunPassClient } from "../src/cli_wrapper";
import { expandTilde } from "../src/cli_wrapper/utils";

export interface StepResult {
	step: string;
	ok: boolean;
	ms: number;
	err?: string;
}

export async function step(
	name: string,
	fn: () => Promise<void>,
): Promise<void>;
export async function step(
	name: string,
	opts: { critical?: boolean },
	fn: () => Promise<void>,
): Promise<void>;
export async function step(
	name: string,
	opts?: { critical?: boolean } | (() => Promise<void>),
	fn?: () => Promise<void>,
) {
	if (!fn) {
		fn = (opts as () => Promise<void>) ?? (async () => {});
		opts = undefined;
	}
	const start = performance.now();
	const results = getResults();
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
		if (opts && typeof opts === "object" && opts.critical) {
			console.error(`  ⛔ CRITICAL FAILURE — aborting scenario`);
			throw err;
		}
	}
}

const resultsSymbol = Symbol.for("multibunpass.e2e.results");

function getResults(): StepResult[] {
	if (!(globalThis as any)[resultsSymbol]) {
		(globalThis as any)[resultsSymbol] = [];
	}
	return (globalThis as any)[resultsSymbol];
}

export function getStepResults(): StepResult[] {
	return getResults();
}

export function resetStepResults(): void {
	(globalThis as any)[resultsSymbol] = [];
}

export function printSummary() {
	const results = getResults();
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

export async function setupVM(
	client: MultiBunPassClient,
	vmName: string,
	tmpDir: string,
) {
	const vms = await client.list();
	const existing = vms.find((v) => v.name === vmName);

	if (!existing) {
		throw new Error(
			`VM "${vmName}" not found. Run "bun run e2e:setup" first to create preloaded test VMs.`,
		);
	}

	console.log(`    VM "${vmName}" already exists (state=${existing.state})`);
	const vm = client.getUnsafe(vmName, tmpDir);
	if (existing.state !== "Running") {
		await vm.start();
	}
	const resolvedDest = expandTilde(vm.remotePath);
	await execMultipass(["exec", vmName, "--", "mkdir", "-p", resolvedDest]);
	await vm.pushFiles();
	return vm;
}
