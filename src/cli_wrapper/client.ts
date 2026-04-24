import { execMultipass } from "./cli";
import { writeCloudConfigTempFile } from "./cloud-config";
import { log } from "./logger";
import { parseVMInfo } from "./parsers";
import type { ExecResult, VMInfo } from "./types";
import { VM } from "./vm";
import { basename } from "node:path";

const DEFAULT_REMOTE_PATH = "~/app/";

function resolvePath(path: string): string {
	return path.startsWith("~/") ? `/home/ubuntu/${path.slice(2)}` : path;
}

export class MultiBunPassClient {
	async list(): Promise<VMInfo[]> {
		const result = await execMultipass(["list", "--format", "json"]);
		try {
			const parsed = JSON.parse(result.stdout);
			return parsed.list || [];
		} catch (err) {
			log.error(
				`failed to parse list output: ${(err as Error).message}, raw: ${result.stdout.slice(0, 200)}`,
			);
			throw err;
		}
	}

	async create(
		name: string,
		folderPath: string,
		remotePath?: string,
	): Promise<VM> {
		const dest = remotePath || DEFAULT_REMOTE_PATH;
		log.info(`creating VM "${name}" from ${folderPath}`);

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

		log.debug(`VM "${name}" launched, waiting for cloud-init`);
		await this.waitForCloudInit(name);

		log.debug(`creating remote directory ${dest} on ${name}`);
		await execMultipass([
			"exec",
			name,
			"--",
			"mkdir",
			"-p",
			resolvePath(dest),
		]);

		log.debug(`transferring ${folderPath} → ${name}:${dest}`);
		const resolvedDest = resolvePath(dest);
		await execMultipass([
			"transfer",
			"--recursive",
			folderPath,
			`${name}:${resolvedDest}`,
		]);

		const folderName = basename(folderPath.replace(/\/+$/, ""));
		log.debug(
			`flattening ${resolvedDest}${folderName}/ → ${resolvedDest}`,
		);
		await execMultipass([
			"exec",
			name,
			"--",
			"bash",
			"-lc",
			`shopt -s dotglob && mv '${resolvedDest}${folderName}'/* '${resolvedDest}' && rmdir '${resolvedDest}${folderName}'`,
		]);

		log.info(`VM "${name}" created successfully`);
		return new VM(name, folderPath, remotePath);
	}

	async delete(name: string): Promise<ExecResult> {
		log.info(`deleting VM "${name}"`);
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
			} catch (err) {
				log.warn(
					`cloud-init check failed on attempt ${i + 1}/${maxAttempts} for "${name}": ${(err as Error).message}`,
				);
			}
			await Bun.sleep(delayMs);
		}

		throw new Error(
			`cloud-init did not complete for ${name} after ${maxAttempts} attempts`,
		);
	}
}
