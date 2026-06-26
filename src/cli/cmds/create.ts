import type { ArgumentsCamelCase } from "yargs";
import { client } from "../client-cli";

export const command = "create <name>";
export const describe = "Create a new VM";

export const builder = {
	"local-path": {
		type: "string" as const,
		demandOption: true,
		description: "Local project folder path",
	},
	"remote-path": {
		type: "string" as const,
		description: "Destination path inside the VM",
	},
};

interface Args {
	name: string;
	"local-path": string;
	"remote-path"?: string;
	json: boolean;
}

export async function handler(argv: ArgumentsCamelCase<Args>): Promise<void> {
	await client.create(argv.name, argv["local-path"], argv["remote-path"]);
	if (argv.json) {
		process.stdout.write(
			`${JSON.stringify({ success: true, name: argv.name })}\n`,
		);
	} else {
		process.stdout.write(`OK: ${argv.name} created\n`);
	}
}
