import { execMultipass } from "./cli";
import { writeCloudConfigTempFile } from "./cloud-config";
import type { ExecResult, VMInfo } from "./types";
import { VM } from "./vm";

const DEFAULT_REMOTE_PATH = "~/app/";

export class MultiBunPassClient {
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
			"24.04",
			"--name",
			name,
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
