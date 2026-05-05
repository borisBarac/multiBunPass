import type { ArgumentsCamelCase } from "yargs";
import { client } from "../client-cli";

export const command = "delete <name>";
export const describe = "Delete and purge a VM";

export const builder = {};

interface Args {
	name: string;
	json: boolean;
}

export async function handler(argv: ArgumentsCamelCase<Args>): Promise<void> {
	await client.delete(argv.name);
	if (argv.json) {
		process.stdout.write(
			`${JSON.stringify({ success: true, name: argv.name })}\n`,
		);
	} else {
		process.stdout.write(`OK: ${argv.name} deleted\n`);
	}
}
