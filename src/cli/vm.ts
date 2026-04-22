import { execMultipass } from "./cli";
import { log } from "./logger";
import { parseVMInfo } from "./parsers";
import type { ExecResult } from "./types";

const DEFAULT_REMOTE_PATH = "~/app/";

export class VM {
	readonly name: string;
	readonly folderPath: string;
	readonly remotePath: string;

	constructor(name: string, folderPath: string, remotePath?: string) {
		this.name = name;
		this.folderPath = folderPath;
		this.remotePath = remotePath || DEFAULT_REMOTE_PATH;
	}

	async exec(command: string): Promise<ExecResult> {
		log.debug(`exec on ${this.name}: ${command}`);
		return execMultipass(["exec", this.name, "--", "bash", "-lc", command]);
	}

	getLocalPath(): string {
		return this.remotePath;
	}

	async stop(): Promise<ExecResult> {
		return execMultipass(["stop", this.name]);
	}

	async start(): Promise<ExecResult> {
		return execMultipass(["start", this.name]);
	}

	async info() {
		const result = await execMultipass(["info", this.name, "--format", "json"]);
		return parseVMInfo(this.name, result.stdout);
	}

	async resync(): Promise<ExecResult> {
		log.debug(`resync: clearing ${this.remotePath} on ${this.name}`);
		try {
			await execMultipass([
				"exec",
				this.name,
				"--",
				"bash",
				"-c",
				`rm -rf ${this.remotePath}*`,
			]);
		} catch (err) {
			log.warn(
				`resync: failed to clear remote path on ${this.name}: ${(err as Error).message}`,
			);
		}
		return execMultipass([
			"transfer",
			"--recursive",
			this.folderPath,
			`${this.name}:${this.remotePath}`,
		]);
	}
}
