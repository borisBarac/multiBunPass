import { log } from "../cli_wrapper/logger";
import type {
	ExecResult,
	OutputWrapperOptions,
	OutputWrapperStatus,
} from "../cli_wrapper/types";

type InternalOptions = Required<OutputWrapperOptions>;
type BunSocket = Awaited<ReturnType<typeof Bun.connect>>;

export class OutputWrapper {
	private client: BunSocket | null = null;
	private opts: InternalOptions;
	private bytesSent = 0;

	constructor(opts: OutputWrapperOptions) {
		this.opts = {
			host: "localhost",
			local: true,
			...opts,
		};
	}

	async start(): Promise<void> {
		const rawTimeout = Number(Bun.env.MBP_STREAM_CONNECT_TIMEOUT);
		const timeoutMs =
			Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 30000;

		const handler = this;
		try {
			this.client = await Promise.race([
				Bun.connect({
					hostname: this.opts.host,
					port: this.opts.port,
					socket: {
						data() {},
						open() {},
						close() {
							handler.client = null;
							log.debug("OutputWrapper connection closed");
						},
						error(_socket, error) {
							log.error(`OutputWrapper socket error: ${error}`);
						},
					},
				}),
				Bun.sleep(timeoutMs).then(() => {
					throw new Error(
						`OutputWrapper connection to ${this.opts.host}:${this.opts.port} timed out after ${timeoutMs}ms`,
					);
				}),
			]);
			log.info(
				`OutputWrapper connected to ${this.opts.host}:${this.opts.port}`,
			);
		} catch (err) {
			log.error(`failed to connect OutputWrapper: ${(err as Error).message}`);
			throw err;
		}
	}

	write(data: string | Uint8Array): void {
		const buf =
			typeof data === "string" ? new TextEncoder().encode(data) : data;
		if (this.opts.local) {
			process.stdout.write(buf);
		}
		if (this.client) {
			this.client.write(buf);
			this.bytesSent += buf.byteLength;
		}
	}

	async spawnAndWrap(
		cmd: string[],
		opts?: Record<string, unknown>,
	): Promise<ExecResult> {
		const proc = Bun.spawn(cmd, {
			stdout: "pipe",
			stderr: "pipe",
			...opts,
		});

		const stdoutChunks: Uint8Array[] = [];
		const stderrChunks: Uint8Array[] = [];

		const pipeStream = async (
			stream: ReadableStream<Uint8Array> | undefined,
			chunks: Uint8Array[],
		) => {
			if (!stream) return;
			const reader = stream.getReader();
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
				this.write(value);
			}
		};

		await Promise.all([
			pipeStream(
				proc.stdout as ReadableStream<Uint8Array> | undefined,
				stdoutChunks,
			),
			pipeStream(
				proc.stderr as ReadableStream<Uint8Array> | undefined,
				stderrChunks,
			),
		]);

		const exitCode = await proc.exited;

		return {
			stdout: Buffer.concat(stdoutChunks).toString(),
			stderr: Buffer.concat(stderrChunks).toString(),
			exitCode,
		};
	}

	status(): OutputWrapperStatus {
		return {
			connected: this.client !== null,
			host: this.opts.host,
			port: this.opts.port,
			bytesSent: this.bytesSent,
		};
	}

	async close(): Promise<void> {
		log.debug(`OutputWrapper closed, ${this.bytesSent} bytes sent`);
		this.client?.end();
		this.client = null;
	}
}
