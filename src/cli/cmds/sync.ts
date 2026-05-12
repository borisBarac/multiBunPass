import type { ArgumentsCamelCase } from "yargs";
import { client } from "../client-cli";

export const command = "sync <name>";
export const describe = "Sync local files to a VM";

export const builder = {
	"local-path": {
		type: "string" as const,
		demandOption: true,
		description: "Local project folder path",
	},
};

interface Args {
	name: string;
	"local-path": string;
	json: boolean;
}

export async function handler(argv: ArgumentsCamelCase<Args>): Promise<void> {
	const vm = await client.get(argv.name, argv["local-path"]);
	await vm.pushFiles();
	if (argv.json) {
		process.stdout.write(
			`${JSON.stringify({ success: true, name: argv.name })}\n`,
		);
	} else {
		process.stdout.write(`OK: ${argv.name} synced\n`);
	}
}
