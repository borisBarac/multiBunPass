import { basename } from "node:path";
import { OutputWrapper } from "../out_stream";
import { execMultipass, setOutputWrapper } from "./cli";
import { log } from "./logger";
import { parseVMInfo } from "./parsers";
import type { ExecOptions, ExecResult } from "./types";
import { expandTilde, getDefaultRemotePath } from "./utils";

export class VM {
	/** Multipass VM name. */
	readonly name: string;
	/** Absolute path to the local folder on the host machine. */
	readonly localPath: string;
	/** Remote path inside the VM where files are deployed (e.g. `"~/app/"`). */
	readonly remotePath: string;

	constructor(name: string, localPath: string, remotePath?: string) {
		this.name = name;
		this.localPath = localPath;
		this.remotePath = remotePath || getDefaultRemotePath();
	}

	/**
	 * Run a raw command inside the VM via `multipass exec ... bash -lc <command>`.
	 * No CWD wrapping or streaming — used internally.
	 */
	private async runMultipassExec(command: string): Promise<ExecResult> {
		log.debug(`exec on ${this.name}: ${command}`);
		return execMultipass(["exec", this.name, "--", "bash", "-lc", command]);
	}

	/**
	 * Execute a command inside the VM.
	 *
	 * The command runs inside the VM's `remotePath` by default (after a pre-flight
	 * directory check). If the directory doesn't exist, returns an error result
	 * instead of creating it.
	 *
	 * Optionally streams output over TCP by connecting to a listener on the given port.
	 *
	 * @param command - Shell command to execute inside the VM.
	 * @param options - Optional settings: `streamPort` for TCP streaming, `cwd` to
	 *   override the working directory (defaults to the VM's `remotePath`).
	 * @returns An {@link ExecResult} with stdout, stderr, and exitCode.
	 */
	async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
		const cwd = expandTilde(options?.cwd ?? this.remotePath);

		if (!options?.skipPreflight) {
			try {
				await this.runMultipassExec(`test -d '${cwd}'`);
			} catch {
				return {
					stdout: "",
					stderr: `Directory "${cwd}" does not exist in VM "${this.name}". Run pushFiles() first.`,
					exitCode: 1,
				};
			}
		}

		const fullCommand = `cd '${cwd}' && ${command}`;

		if (options?.streamPort === undefined) {
			return this.runMultipassExec(fullCommand);
		}

		const wrapper = new OutputWrapper({ port: options.streamPort });
		try {
			await wrapper.start();
			setOutputWrapper(wrapper);
			return await this.runMultipassExec(fullCommand);
		} catch (err) {
			const msg = (err as Error).message;
			if (msg.toLowerCase().includes("connection refused")) {
				return {
					stdout: "",
					stderr: `Connection refused on port ${options.streamPort} — is a listener running? (e.g. nc -l localhost ${options.streamPort})`,
					exitCode: 1,
				};
			}
			throw err;
		} finally {
			setOutputWrapper(null);
			await wrapper.close();
		}
	}

	/**
	 * Stop the VM.
	 * @returns The result of the `multipass stop` command.
	 */
	async stop(): Promise<ExecResult> {
		return execMultipass(["stop", this.name]);
	}

	/**
	 * Start the VM.
	 * @returns The result of the `multipass start` command.
	 */
	async start(): Promise<ExecResult> {
		return execMultipass(["start", this.name]);
	}

	/**
	 * Check whether the VM is currently running.
	 * @returns `true` if the VM state is "Running", `false` otherwise.
	 */
	async isRunning(): Promise<boolean> {
		const result = await execMultipass(["list"]);
		const lines = result.stdout.trim().split("\n");
		for (const line of lines.slice(1)) {
			const parts = line.split(/\s{2,}/);
			if (parts[0] === this.name) {
				return parts[1] === "Running";
			}
		}
		return false;
	}

	/**
	 * Get detailed information about the VM (CPU, memory, disk, mounts, etc.).
	 * @returns Parsed VM details.
	 */
	async info() {
		const result = await execMultipass(["info", this.name, "--format", "json"]);
		return parseVMInfo(this.name, result.stdout);
	}

	/**
	 * Push local files to the VM. Clears the remote directory first,
	 * then transfers the local folder contents (with flatten).
	 *
	 * @returns The result of the `multipass transfer` command.
	 */
	async pushFiles(): Promise<ExecResult> {
		const resolvedDest = expandTilde(this.remotePath);
		log.info(`pushFiles: clearing ${resolvedDest} on ${this.name}`);
		try {
			await execMultipass([
				"exec",
				this.name,
				"--",
				"bash",
				"-c",
				`rm -rf '${resolvedDest}'*`,
			]);
		} catch (err) {
			log.warn(
				`pushFiles: failed to clear remote path on ${this.name}: ${(err as Error).message}`,
			);
		}
		const result = await execMultipass([
			"transfer",
			"--recursive",
			this.localPath,
			`${this.name}:${resolvedDest}`,
		]);

		const folderName = basename(this.localPath.replace(/\/+$/, ""));
		log.debug(
			`pushFiles: flattening ${resolvedDest}${folderName}/ → ${resolvedDest}`,
		);
		await execMultipass([
			"exec",
			this.name,
			"--",
			"bash",
			"-lc",
			`shopt -s dotglob && mv '${resolvedDest}${folderName}'/* '${resolvedDest}' && rmdir '${resolvedDest}${folderName}'`,
		]);

		return result;
	}
}
