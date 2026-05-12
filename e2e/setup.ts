#!/usr/bin/env bun
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MultiBunPassClient } from "../src/cli_wrapper";
import { execMultipass } from "../src/cli_wrapper/cli";

const E2E_VMS = [{ name: "mbp-e2e-lifecycle" }, { name: "mbp-e2e-server" }];

async function main() {
	const client = new MultiBunPassClient();
	console.log("E2E Setup: provisioning test VMs\n");

	const results: { name: string; action: string }[] = [];

	for (const { name } of E2E_VMS) {
		console.log(`--- ${name} ---`);

		const vms = await client.list();
		const existing = vms.find((v) => v.name === name);

		if (existing) {
			if (existing.state !== "Running") {
				console.log(`  exists but ${existing.state}, starting...`);
				await execMultipass(["start", name]);
			}

			const bunCheck = await execMultipass([
				"exec",
				name,
				"--",
				"bash",
				"-lc",
				"bun --version",
			]);

			if (bunCheck.exitCode === 0) {
				console.log(`  ready (bun ${bunCheck.stdout.trim()}), skipping\n`);
				results.push({ name, action: "skipped (ready)" });
				continue;
			}

			console.log(
				`  bun not found, recreating with default cloud-config...`,
			);
			await client.delete(name);
		}

		const tmp = join(tmpdir(), `multibunpass-e2e-preload-${name}`);
		mkdirSync(tmp, { recursive: true });
		writeFileSync(
			join(tmp, "package.json"),
			JSON.stringify({ name: "e2e-preload", version: "0.0.0" }),
		);

		try {
			console.log(`  creating (this takes ~1-2 min)...`);
			await client.create(name, tmp);
			console.log(`  created and provisioned\n`);
			results.push({ name, action: "created" });
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	}

	console.log("─────────────────────────────────────────");
	console.log("E2E Setup Summary");
	console.log("─────────────────────────────────────────");
	for (const r of results) {
		console.log(`  ${r.name}: ${r.action}`);
	}
	console.log("─────────────────────────────────────────\n");
	console.log("Ready. Run e2e tests with: bun run test-e2e");
}

main().catch((err) => {
	console.error(`e2e setup failed: ${(err as Error).message}`);
	process.exit(1);
});
