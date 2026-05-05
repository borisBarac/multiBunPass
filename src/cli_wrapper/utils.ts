export function getDefaultRemotePath(): string {
	return Bun.env.MBP_REMOTE_PATH || "~/app/";
}

export function expandTilde(path: string): string {
	return path.startsWith("~/") ? `/home/ubuntu/${path.slice(2)}` : path;
}

export function shellEscape(s: string): string {
	return s.replace(/'/g, "'\\''");
}
