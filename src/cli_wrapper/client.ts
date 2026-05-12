import { basename } from "node:path";
import { execMultipass } from "./cli";
import {
	cleanupCloudConfigTempFile,
	writeCloudConfigTempFile,
} from "./cloud-config";
import { waitForCloudInit } from "./cloud-init";
import { log } from "./logger";
import { parseVMInfo } from "./parsers";
import type { ExecResult, VMInfo } from "./types";
import { expandTilde, getDefaultRemotePath, shellEscape } from "./utils";
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
	async create(name: string, localPath: string): Promise<VM> {
		const dest = getDefaultRemotePath();
		log.info(`creating VM "${name}" from ${localPath}`);

		const configPath = await writeCloudConfigTempFile();

		try {
			await execMultipass([
				"launch",
				"lts",
				"--name",
				name,
				"--bridged",
				"--cloud-init",
				configPath,
			]);
		} catch (err) {
			log.warn(`launch failed, cleaning up VM "${name}"`);
			try {
				await execMultipass(["delete", name]);
				await execMultipass(["purge"]);
			} catch {
				// best-effort cleanup
			}
			throw err;
		} finally {
			await cleanupCloudConfigTempFile(configPath);
		}

		log.info(`VM "${name}" launched, waiting for cloud-init`);
		await waitForCloudInit(name);

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
		const subfolderPath = `${resolvedDest}${folderName}`;

		try {
			await execMultipass(["exec", name, "--", "test", "-d", subfolderPath]);
		} catch {
			throw new Error(
				`Expected subfolder "${subfolderPath}" not found in VM "${name}" after transfer. The local path may not match the expected structure.`,
			);
		}

		log.debug(`flattening ${subfolderPath}/ → ${resolvedDest}`);
		await execMultipass([
			"exec",
			name,
			"--",
			"bash",
			"-lc",
			`shopt -s dotglob && mv '${shellEscape(resolvedDest)}${shellEscape(folderName)}'/* '${shellEscape(resolvedDest)}' && rmdir '${shellEscape(resolvedDest)}${shellEscape(folderName)}'`,
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
		return new VM(name, localPath);
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
	async get(name: string, localPath: string): Promise<VM> {
		const dest = expandTilde(getDefaultRemotePath());

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

		return new VM(name, localPath);
	}

	/**
	 * Check whether a VM with the given name exists.
	 * Uses the JSON-based `list()` output for reliability.
	 *
	 * @param name - VM name.
	 * @returns `true` if the VM exists, `false` otherwise.
	 */
	async exists(name: string): Promise<boolean> {
		const vms = await this.list();
		return vms.some((v) => v.name === name);
	}

	/**
	 * Get the running status of a VM.
	 * Uses the JSON-based `list()` output for reliability.
	 *
	 * @param name - VM name.
	 * @returns An object with a `running` boolean.
	 * @throws If the VM is not found.
	 */
	async getStatus(name: string): Promise<{ running: boolean }> {
		const vms = await this.list();
		const vm = vms.find((v) => v.name === name);
		if (!vm) {
			throw new Error(`VM "${name}" not found.`);
		}
		return { running: vm.state === "Running" };
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
	getUnsafe(name: string, localPath: string): VM {
		return new VM(name, localPath);
	}
}
