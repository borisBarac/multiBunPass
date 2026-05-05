import type { ArgumentsCamelCase } from "yargs";
import { client } from "../client-cli";
import { formatInfo } from "../format";

export const command = "info <name>";
export const describe = "Show detailed VM info";

export const builder = {};

interface Args {
	name: string;
	json: boolean;
}

export async function handler(argv: ArgumentsCamelCase<Args>): Promise<void> {
	const info = await client.info(argv.name);
	if (argv.json) {
		process.stdout.write(`${JSON.stringify(info, null, 2)}\n`);
	} else {
		process.stdout.write(`${formatInfo(info)}\n`);
	}
}
