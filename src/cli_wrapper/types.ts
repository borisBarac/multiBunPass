export type ExecResult = {
	stdout: string;
	stderr: string;
	exitCode: number;
};

export type VMInfo = {
	name: string;
	state: string;
	ipv4: string[];
	image: string;
	release: string;
};

export type VMDetailedInfo = {
	name: string;
	state: string;
	snapshots: number;
	ipv4: string[];
	release: string;
	image_hash: string;
	cpu_count: number;
	load: number[];
	disk: { used: string; total: string };
	memory: { used: string; total: string };
	mounts: string[];
};

export type CreateVMOptions = {
	name: string;
	folderPath: string;
	remotePath?: string;
};

export type OutputWrapperOptions = {
	/** TCP port to listen on for external client connections (e.g. a dashboard or monitoring tool) */
	port: number;
	/** Hostname to bind the TCP server to. Defaults to "0.0.0.0" (all interfaces). Set to "127.0.0.1" for localhost only. */
	host?: string;
	/** Whether to also print output to local stdout. Defaults to true. Set to false for headless/daemon usage. */
	local?: boolean;
};

export type OutputWrapperStatus = {
	listening: boolean;
	clientConnected: boolean;
	host: string;
	port: number;
	bytesSent: number;
};
