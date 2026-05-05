#!/usr/bin/env bun
import { execMultipass } from "../cli_wrapper/cli";

async function main() {
	process.stdout.write("deleting all multipass VMs…\n");
	try {
		await execMultipass(["delete", "--all", "--purge"]);
		process.stdout.write("done — all VMs removed.\n");
	} catch (err) {
		if ((err as Error).message?.includes("no instances to delete")) {
			process.stdout.write("no VMs to delete.\n");
			return;
		}
		process.stderr.write(`cleanup failed: ${(err as Error).message}\n`);
		process.exit(1);
	}
}

main();
