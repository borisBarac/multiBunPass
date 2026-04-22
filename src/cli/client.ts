import { execMultipass, setOutputWrapper } from "./cli";
import { writeCloudConfigTempFile } from "./cloud-config";
import { parseVMInfo } from "./parsers";
import type { ExecResult, OutputWrapperOptions, VMDetailedInfo, VMInfo } from "./types";
import { VM } from "./vm";
import { OutputWrapper } from "../out_stream";

const DEFAULT_REMOTE_PATH = "~/app/";

export type MultiBunPassClientOptions = {
	stream?: OutputWrapperOptions;
};

export class MultiBunPassClient {
	private wrapper: OutputWrapper | null = null;

	constructor(opts?: MultiBunPassClientOptions) {
		if (opts?.stream) {
			this.wrapper = new OutputWrapper(opts.stream);
			setOutputWrapper(this.wrapper);
		}
	}

	async init(): Promise<void> {
		await this.wrapper?.start();
	}

	async close(): Promise<void> {
		await this.wrapper?.close();
		setOutputWrapper(null);
		this.wrapper = null;
	}

	status() {
		return this.wrapper?.status() ?? null;
	}
	async list(): Promise<VMInfo[]> {
		const result = await execMultipass(["list", "--format", "json"]);
		const parsed = JSON.parse(result.stdout);
		return parsed.list || [];
	}

	async create(
		name: string,
		folderPath: string,
		remotePath?: string,
	): Promise<VM> {
		const dest = remotePath || DEFAULT_REMOTE_PATH;
		const configPath = writeCloudConfigTempFile();

		await execMultipass([
			"launch",
			"lts",
			"--name",
			name,
			"--bridged",
			"--cloud-init",
			configPath,
		]);

		await this.waitForCloudInit(name);

		await execMultipass([
			"transfer",
			"--recursive",
			folderPath,
			`${name}:${dest}`,
		]);

		return new VM(name, folderPath, remotePath);
	}

	async delete(name: string): Promise<ExecResult> {
		await execMultipass(["delete", name]);
		return execMultipass(["purge"]);
	}

	async info(name: string) {
		const result = await execMultipass(["info", name, "--format", "json"]);
		return parseVMInfo(name, result.stdout);
	}

	get(name: string, folderPath: string, remotePath?: string): VM {
		return new VM(name, folderPath, remotePath);
	}

	private async waitForCloudInit(name: string): Promise<void> {
		const maxAttempts = 30;
		const delayMs = 2000;

		for (let i = 0; i < maxAttempts; i++) {
			try {
				const result = await execMultipass([
					"exec",
					name,
					"--",
					"bash",
					"-c",
					"cloud-init status --wait 2>/dev/null && echo DONE",
				]);
				if (result.stdout.includes("DONE")) {
					return;
				}
			} catch {
				// VM might not be ready yet
			}
			await Bun.sleep(delayMs);
		}

		throw new Error(
			`cloud-init did not complete for ${name} after ${maxAttempts} attempts`,
		);
	}
}
