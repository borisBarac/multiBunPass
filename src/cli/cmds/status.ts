import type { ArgumentsCamelCase } from "yargs";
import { client } from "../client-cli";

export const command = "status <name>";
export const describe = "Check if a VM is running";

export const builder = {};

interface Args {
	name: string;
	json: boolean;
}

export async function handler(argv: ArgumentsCamelCase<Args>): Promise<void> {
	const { running } = await client.getStatus(argv.name);
	if (argv.json) {
		process.stdout.write(`${JSON.stringify({ name: argv.name, running })}\n`);
	} else {
		process.stdout.write(
			`${argv.name} is ${running ? "Running" : "Stopped"}\n`,
		);
	}
}
