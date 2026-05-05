import { execMultipass } from "./cli";
import { log } from "./logger";

export async function waitForCloudInit(name: string): Promise<void> {
	const maxAttempts = 30;
	const delayMs = 2000;

	for (let i = 0; i < maxAttempts; i++) {
		try {
			const result = await execMultipass([
				"exec",
				name,
				"--",
				"bash",
				"-c",
				"cloud-init status --wait 2>/dev/null && echo DONE",
			]);
			if (result.stdout.includes("DONE")) {
				return;
			}
		} catch (err) {
			log.warn(
				`cloud-init check failed on attempt ${i + 1}/${maxAttempts} for "${name}": ${(err as Error).message}`,
			);
		}
		await Bun.sleep(delayMs);
	}

	throw new Error(
		`cloud-init did not complete for ${name} after ${maxAttempts} attempts`,
	);
}
