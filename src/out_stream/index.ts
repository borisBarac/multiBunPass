import { log } from "../cli_wrapper/logger";
import type {
	ExecResult,
	OutputWrapperOptions,
	OutputWrapperStatus,
} from "../cli_wrapper/types";

type InternalOptions = Required<OutputWrapperOptions>;

export class OutputWrapper {
	// biome-ignore lint/suspicious/noExplicitAny: Bun socket/server types lack convenient imports
	private server: any = null;
	// biome-ignore lint/suspicious/noExplicitAny: Bun socket/server types lack convenient imports
	private client: any = null;
	private opts: InternalOptions;
	private pendingData: Uint8Array[] = [];
	private bytesSent = 0;

	constructor(opts: OutputWrapperOptions) {
		this.opts = {
			host: "0.0.0.0",
			local: true,
			...opts,
		};
	}

	async start(): Promise<void> {
		const handler = this;
		try {
			this.server = Bun.listen({
				hostname: this.opts.host,
				port: this.opts.port,
				socket: {
					data() {},
					open(socket) {
						if (handler.client) {
							log.warn("rejecting additional client connection");
							socket.end();
							return;
						}
						handler.client = socket;
						log.info(
							`OutputWrapper client connected from ${socket.remoteAddress}`,
						);
						for (const chunk of handler.pendingData) {
							socket.write(chunk);
						}
						handler.pendingData = [];
					},
					close(socket) {
						if (handler.client === socket) {
							handler.client = null;
							log.debug("OutputWrapper client disconnected");
						}
					},
					error(_socket, error) {
						log.error(`OutputWrapper socket error: ${error}`);
					},
				},
			});
			log.info(
				`OutputWrapper listening on ${this.opts.host}:${this.opts.port}`,
			);
		} catch (err) {
			log.error(`failed to start OutputWrapper: ${(err as Error).message}`);
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
		} else {
			this.pendingData.push(buf);
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
			listening: this.server !== null,
			clientConnected: this.client !== null,
			host: this.opts.host,
			port: this.opts.port,
			bytesSent: this.bytesSent,
		};
	}

	async close(): Promise<void> {
		log.debug(`OutputWrapper closed, ${this.bytesSent} bytes sent`);
		this.client?.end();
		this.server?.stop();
		this.client = null;
		this.server = null;
	}
}
