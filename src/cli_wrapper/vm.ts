import { OutputWrapper } from "../out_stream";
import { execMultipass, setOutputWrapper } from "./cli";
import { log } from "./logger";
import { parseVMInfo } from "./parsers";
import type { ExecResult } from "./types";
import { basename } from "node:path";

const DEFAULT_REMOTE_PATH = "~/app/";

function resolvePath(path: string): string {
	return path.startsWith("~/") ? `/home/ubuntu/${path.slice(2)}` : path;
}

async function isPortAvailable(port: number): Promise<boolean> {
	try {
		const server = Bun.listen({
			hostname: "0.0.0.0",
			port,
			socket: {
				data() {},
				open() {},
				close() {},
				error() {},
			},
		});
		server.stop();
		return true;
	} catch {
		return false;
	}
}

export class VM {
	readonly name: string;
	readonly folderPath: string;
	readonly remotePath: string;

	constructor(name: string, folderPath: string, remotePath?: string) {
		this.name = name;
		this.folderPath = folderPath;
		this.remotePath = remotePath || DEFAULT_REMOTE_PATH;
	}

	private async execRaw(command: string): Promise<ExecResult> {
		log.debug(`exec on ${this.name}: ${command}`);
		return execMultipass(["exec", this.name, "--", "bash", "-lc", command]);
	}

	async exec(command: string, streamPort?: number): Promise<ExecResult> {
		if (streamPort === undefined) {
			return this.execRaw(command);
		}

		const available = await isPortAvailable(streamPort);
		if (!available) {
			return {
				stdout: "",
				stderr: `Port ${streamPort} is already in use`,
				exitCode: 1,
			};
		}

		const wrapper = new OutputWrapper({ port: streamPort });
		try {
			await wrapper.start();
			setOutputWrapper(wrapper);
			return await this.execRaw(command);
		} finally {
			setOutputWrapper(null);
			await wrapper.close();
		}
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

	async info() {
		const result = await execMultipass(["info", this.name, "--format", "json"]);
		return parseVMInfo(this.name, result.stdout);
	}

	async resync(): Promise<ExecResult> {
		const resolvedDest = resolvePath(this.remotePath);
		log.debug(`resync: clearing ${resolvedDest} on ${this.name}`);
		try {
			await execMultipass([
				"exec",
				this.name,
				"--",
				"bash",
				"-c",
				`rm -rf ${resolvedDest}*`,
			]);
		} catch (err) {
			log.warn(
				`resync: failed to clear remote path on ${this.name}: ${(err as Error).message}`,
			);
		}
		const result = await execMultipass([
			"transfer",
			"--recursive",
			this.folderPath,
			`${this.name}:${resolvedDest}`,
		]);

		const folderName = basename(this.folderPath.replace(/\/+$/, ""));
		log.debug(
			`resync: flattening ${resolvedDest}${folderName}/ → ${resolvedDest}`,
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
