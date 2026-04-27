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
	/** TCP port to connect to on the remote listener (e.g. nc -l localhost 3333) */
	port: number;
	/** Hostname to connect to. Defaults to "127.0.0.1". */
	host?: string;
	/** Whether to also print output to local stdout. Defaults to true. */
	local?: boolean;
};

export type OutputWrapperStatus = {
	connected: boolean;
	host: string;
	port: number;
	bytesSent: number;
};
