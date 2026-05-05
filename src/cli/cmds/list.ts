import type { ArgumentsCamelCase } from "yargs";
import { client } from "../client-cli";
import { formatList } from "../format";

export const command = "list";
export const describe = "List all VMs";

export const builder = {};

interface Args {
	json: boolean;
}

export async function handler(argv: ArgumentsCamelCase<Args>): Promise<void> {
	const vms = await client.list();
	if (argv.json) {
		process.stdout.write(`${JSON.stringify(vms, null, 2)}\n`);
	} else {
		process.stdout.write(`${formatList(vms)}\n`);
	}
}
