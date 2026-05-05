import { homedir } from "node:os";
import { log } from "./logger";

export const DEFAULT_CLOUD_CONFIG = `#cloud-config
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

export { DEFAULT_CLOUD_CONFIG as BUN_CLOUD_CONFIG };

const CONFIG_DISCOVERY_PATHS = [
	() => {
		const envPath = Bun.env.MBP_CLOUD_CONFIG;
		return envPath ? { path: envPath, required: true } : null;
	},
	() => ({ path: "mbp-cloud-config.yaml", required: false }),
	() => ({ path: ".multibunpass/cloud-config.yaml", required: false }),
	() => ({
		path: `${homedir()}/.config/multibunpass/cloud-config.yaml`,
		required: false,
	}),
];

export async function resolveCloudConfig(): Promise<string> {
	for (const probe of CONFIG_DISCOVERY_PATHS) {
		const entry = probe();
		if (!entry) continue;

		const file = Bun.file(entry.path);
		const exists = await file.exists();

		if (entry.required && !exists) {
			throw new Error(
				`MBP_CLOUD_CONFIG is set to "${entry.path}" but file does not exist`,
			);
		}

		if (exists) {
			log.info(`using cloud-config from ${entry.path}`);
			return file.text();
		}
	}

	log.debug("no external cloud-config found, using default");
	return DEFAULT_CLOUD_CONFIG;
}

export async function writeCloudConfigTempFile(): Promise<string> {
	const tmpDir = Bun.env.TMPDIR || "/tmp";
	const path = `${tmpDir}/multibunpass-cloud-config.yaml`;
	const content = await resolveCloudConfig();
	log.debug(`writing cloud-config to ${path}`);
	await Bun.write(path, content);
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
