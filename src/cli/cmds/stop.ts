import type { ArgumentsCamelCase } from "yargs";
import { execMultipass } from "../../cli_wrapper/cli";
import { client } from "../client-cli";

export const command = "stop <name>";
export const describe = "Stop a VM";

export const builder = {};

interface Args {
	name: string;
	json: boolean;
}

export async function handler(argv: ArgumentsCamelCase<Args>): Promise<void> {
	if (!(await client.exists(argv.name))) {
		throw new Error(`VM "${argv.name}" not found.`);
	}
	await execMultipass(["stop", argv.name]);
	if (argv.json) {
		process.stdout.write(
			`${JSON.stringify({ success: true, name: argv.name })}\n`,
		);
	} else {
		process.stdout.write(`OK: ${argv.name} stopped\n`);
	}
}
