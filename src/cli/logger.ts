type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
	silent: 4,
};

class Logger {
	private level: number;

	constructor() {
		const env = (Bun.env.LOG_LEVEL || "warn") as LogLevel;
		this.level = LEVELS[env] ?? LEVELS.warn;
	}

	debug(msg: string, ...args: unknown[]) {
		if (this.level <= LEVELS.debug) {
			console.debug(`[debug] ${msg}`, ...args);
		}
	}

	info(msg: string, ...args: unknown[]) {
		if (this.level <= LEVELS.info) {
			console.info(`[info] ${msg}`, ...args);
		}
	}

	warn(msg: string, ...args: unknown[]) {
		if (this.level <= LEVELS.warn) {
			console.warn(`[warn] ${msg}`, ...args);
		}
	}

	error(msg: string, ...args: unknown[]) {
		if (this.level <= LEVELS.error) {
			console.error(`[error] ${msg}`, ...args);
		}
	}
}

export const log = new Logger();
