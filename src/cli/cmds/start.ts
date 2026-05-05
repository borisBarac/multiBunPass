import type { ArgumentsCamelCase } from "yargs";
import { execMultipass } from "../../cli_wrapper/cli";
import { client } from "../client-cli";

export const command = "start <name>";
export const describe = "Start a VM";

export const builder = {};

interface Args {
	name: string;
	json: boolean;
}

export async function handler(argv: ArgumentsCamelCase<Args>): Promise<void> {
	if (!(await client.exists(argv.name))) {
		throw new Error(`VM "${argv.name}" not found.`);
	}
	await execMultipass(["start", argv.name]);
	if (argv.json) {
		process.stdout.write(
			`${JSON.stringify({ success: true, name: argv.name })}\n`,
		);
	} else {
		process.stdout.write(`OK: ${argv.name} started\n`);
	}
}
