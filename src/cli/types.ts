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

export type CreateVMOptions = {
	name: string;
	folderPath: string;
	remotePath?: string;
};

export type OutputWrapperOptions = {
	host?: string;
	port: number;
	local?: boolean;
};

export type OutputWrapperStatus = {
	listening: boolean;
	clientConnected: boolean;
	host: string;
	port: number;
	bytesSent: number;
};
