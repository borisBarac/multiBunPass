import { basename } from "node:path";
import { execMultipass } from "./cli";
import { writeCloudConfigTempFile } from "./cloud-config";
import { log } from "./logger";
import { parseVMInfo } from "./parsers";
import type { ExecResult, VMInfo } from "./types";
import { expandTilde, getDefaultRemotePath } from "./utils";
import { VM } from "./vm";

export class MultiBunPassClient {
	/**
	 * List all Multipass VMs.
	 * @returns Array of VM info objects.
	 */
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

	/**
	 * Create a new Multipass VM, wait for cloud-init, transfer files, and flatten.
	 *
	 * @param name - VM name.
	 * @param localPath - Absolute path to the local folder to transfer.
	 * @param remotePath - Destination path inside the VM. Defaults to `"~/app/"`.
	 * @returns A ready-to-use {@link VM} instance.
	 */
	async create(
		name: string,
		localPath: string,
		remotePath?: string,
	): Promise<VM> {
		const dest = remotePath || getDefaultRemotePath();
		log.info(`creating VM "${name}" from ${localPath}`);

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

		log.info(`VM "${name}" launched, waiting for cloud-init`);
		await this.waitForCloudInit(name);

		const resolvedDest = expandTilde(dest);
		log.debug(`creating remote directory ${resolvedDest} on ${name}`);
		await execMultipass(["exec", name, "--", "mkdir", "-p", resolvedDest]);

		log.info(`transferring ${localPath} → ${name}:${resolvedDest}`);
		await execMultipass([
			"transfer",
			"--recursive",
			localPath,
			`${name}:${resolvedDest}`,
		]);

		const folderName = basename(localPath.replace(/\/+$/, ""));
		log.debug(`flattening ${resolvedDest}${folderName}/ → ${resolvedDest}`);
		await execMultipass([
			"exec",
			name,
			"--",
			"bash",
			"-lc",
			`shopt -s dotglob && mv '${resolvedDest}${folderName}'/* '${resolvedDest}' && rmdir '${resolvedDest}${folderName}'`,
		]);

		log.info(`verifying remote directory ${resolvedDest} on ${name}`);
		try {
			await execMultipass(["exec", name, "--", "test", "-d", resolvedDest]);
		} catch {
			throw new Error(
				`Directory "${resolvedDest}" does not exist in VM "${name}" after creation — transfer or flatten may have failed.`,
			);
		}

		log.info(`VM "${name}" created successfully`);
		return new VM(name, localPath, remotePath);
	}

	/**
	 * Delete a VM and purge it.
	 * @param name - VM name to delete.
	 */
	async delete(name: string): Promise<ExecResult> {
		log.info(`deleting VM "${name}"`);
		await execMultipass(["delete", name]);
		return execMultipass(["purge"]);
	}

	/**
	 * Get detailed information about a VM.
	 * @param name - VM name.
	 */
	async info(name: string) {
		const result = await execMultipass(["info", name, "--format", "json"]);
		return parseVMInfo(name, result.stdout);
	}

	/**
	 * Get a VM instance with pre-flight checks.
	 * Verifies the VM exists and the remote directory is present.
	 * Throws a descriptive error if either check fails.
	 *
	 * @param name - VM name.
	 * @param localPath - Absolute path to the local folder on the host.
	 * @param remotePath - Remote path inside the VM. Defaults to `"~/app/"`.
	 * @returns A {@link VM} instance.
	 */
	async get(name: string, localPath: string, remotePath?: string): Promise<VM> {
		const dest = expandTilde(remotePath ?? getDefaultRemotePath());

		const vms = await this.list();
		if (!vms.find((v) => v.name === name)) {
			throw new Error(
				`VM "${name}" not found. Create it first with client.create().`,
			);
		}

		try {
			await execMultipass(["exec", name, "--", "test", "-d", dest]);
		} catch {
			throw new Error(
				`Directory "${dest}" does not exist in VM "${name}". Run vm.pushFiles() first.`,
			);
		}

		return new VM(name, localPath, remotePath);
	}

	/**
	 * Get a VM instance without any pre-flight checks.
	 * Use when you're certain the VM and remote directory are ready (e.g. right after `create()`).
	 *
	 * @param name - VM name.
	 * @param localPath - Absolute path to the local folder on the host.
	 * @param remotePath - Remote path inside the VM. Defaults to `"~/app/"`.
	 * @returns A {@link VM} instance.
	 */
	getUnsafe(name: string, localPath: string, remotePath?: string): VM {
		return new VM(name, localPath, remotePath);
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
