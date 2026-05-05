import type { ArgumentsCamelCase } from "yargs";
import type { ExecOptions } from "../../cli_wrapper/types";
import { client } from "../client-cli";

export const command = "exec <name>";
export const describe = "Run a command inside a VM";

export const builder = {
	"local-path": {
		type: "string" as const,
		demandOption: true,
		description: "Local project folder path",
	},
	"remote-path": {
		type: "string" as const,
		description: "Remote path inside VM (default: ~/app/)",
	},
	"stream-port": {
		type: "number" as const,
		description: "TCP port to stream output to",
	},
	cwd: {
		type: "string" as const,
		description: "Working directory inside VM",
	},
};

interface Args {
	name: string;
	"local-path": string;
	"remote-path"?: string;
	"stream-port"?: number;
	cwd?: string;
	json: boolean;
	_: (string | number)[];
}

export async function handler(argv: ArgumentsCamelCase<Args>): Promise<void> {
	const command = argv._.join(" ");
	if (!command) {
		process.stderr.write("Error: missing command after --\n");
		process.exit(1);
	}

	const opts: ExecOptions = {};
	if (argv["stream-port"]) {
		opts.streamPort = argv["stream-port"];
	}
	if (argv.cwd) {
		opts.cwd = argv.cwd;
	}

	const vm = await client.get(
		argv.name,
		argv["local-path"],
		argv["remote-path"] || undefined,
	);
	const result = await vm.exec(command, opts);

	if (argv.json) {
		process.stdout.write(
			`${JSON.stringify(
				{
					stdout: result.stdout,
					stderr: result.stderr,
					exitCode: result.exitCode,
				},
				null,
				2,
			)}\n`,
		);
	} else {
		if (result.stdout) process.stdout.write(result.stdout);
		if (result.stderr) process.stderr.write(result.stderr);
	}
	process.exit(result.exitCode);
}
