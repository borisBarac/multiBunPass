import { log } from "./logger";

export const BUN_CLOUD_CONFIG = `#cloud-config
package_update: true
packages:
  - curl
  - unzip

runcmd:
  - |
    curl -fsSL https://bun.sh/install | BUN_INSTALL=/home/ubuntu/.bun bash
  - |
    cat >> /home/ubuntu/.profile << 'PROFILE'
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    PROFILE
  - /home/ubuntu/.bun/bin/bun --version > /home/ubuntu/bun_version.txt
`;

export async function writeCloudConfigTempFile(): Promise<string> {
	const tmpDir = Bun.env.TMPDIR || "/tmp";
	const path = `${tmpDir}/multibunpass-cloud-config.yaml`;
	log.debug(`writing cloud-config to ${path}`);
	await Bun.write(path, BUN_CLOUD_CONFIG);
	return path;
}

export async function cleanupCloudConfigTempFile(path: string): Promise<void> {
	try {
		await Bun.file(path).unlink();
		log.debug(`cleaned up cloud-config temp file ${path}`);
	} catch {
		// ignore — temp file cleanup is best-effort
	}
}
