import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_CLOUD_CONFIG } from "./cloud-config";

const originalEnv = process.env.MBP_CLOUD_CONFIG;

let testDir: string;

function createTestDir(): string {
	testDir = mkdtempSync(join(tmpdir(), "mbp-cloud-config-test-"));
	return testDir;
}

function cleanupTestDir() {
	if (testDir) {
		rmSync(testDir, { recursive: true, force: true });
		testDir = undefined as unknown as string;
	}
}

function clearEnv() {
	delete process.env.MBP_CLOUD_CONFIG;
}

function restoreEnv() {
	if (originalEnv !== undefined) {
		process.env.MBP_CLOUD_CONFIG = originalEnv;
	} else {
		delete process.env.MBP_CLOUD_CONFIG;
	}
}

const CUSTOM_YAML = `#cloud-config
package_update: false
packages:
  - nodejs
`;

describe("resolveCloudConfig", () => {
	beforeEach(() => {
		clearEnv();
	});

	afterEach(() => {
		restoreEnv();
		cleanupTestDir();
	});

	test("returns DEFAULT_CLOUD_CONFIG when no files exist and no env var set", async () => {
		const { resolveCloudConfig } = await import(
			"./cloud-config?t=" + Date.now()
		);
		const result = await resolveCloudConfig();
		expect(result).toBe(DEFAULT_CLOUD_CONFIG);
	});

	test("reads file from MBP_CLOUD_CONFIG env var", async () => {
		createTestDir();
		const filePath = join(testDir, "custom.yaml");
		writeFileSync(filePath, CUSTOM_YAML);

		process.env.MBP_CLOUD_CONFIG = filePath;

		const { resolveCloudConfig } = await import(
			"./cloud-config?t=" + Date.now()
		);
		const result = await resolveCloudConfig();
		expect(result).toBe(CUSTOM_YAML);
	});

	test("throws if MBP_CLOUD_CONFIG points to non-existent file", async () => {
		process.env.MBP_CLOUD_CONFIG = "/tmp/this-file-does-not-exist-abc123.yaml";

		const { resolveCloudConfig } = await import(
			"./cloud-config?t=" + Date.now()
		);
		expect(resolveCloudConfig()).rejects.toThrow(
			'MBP_CLOUD_CONFIG is set to "/tmp/this-file-does-not-exist-abc123.yaml" but file does not exist',
		);
	});

	test("reads file from CWD mbp-cloud-config.yaml", async () => {
		createTestDir();
		writeFileSync(join(testDir, "mbp-cloud-config.yaml"), CUSTOM_YAML);

		const originalCwd = process.cwd();
		process.chdir(testDir);

		try {
			const { resolveCloudConfig } = await import(
				"./cloud-config?t=" + Date.now()
			);
			const result = await resolveCloudConfig();
			expect(result).toBe(CUSTOM_YAML);
		} finally {
			process.chdir(originalCwd);
		}
	});

	test("reads file from .multibunpass/cloud-config.yaml in CWD", async () => {
		createTestDir();
		const hiddenDir = join(testDir, ".multibunpass");
		mkdirSync(hiddenDir);
		writeFileSync(join(hiddenDir, "cloud-config.yaml"), CUSTOM_YAML);

		const originalCwd = process.cwd();
		process.chdir(testDir);

		try {
			const { resolveCloudConfig } = await import(
				"./cloud-config?t=" + Date.now()
			);
			const result = await resolveCloudConfig();
			expect(result).toBe(CUSTOM_YAML);
		} finally {
			process.chdir(originalCwd);
		}
	});

	test("prefers mbp-cloud-config.yaml over .multibunpass/cloud-config.yaml", async () => {
		createTestDir();
		writeFileSync(join(testDir, "mbp-cloud-config.yaml"), "priority: cwd");
		const hiddenDir = join(testDir, ".multibunpass");
		mkdirSync(hiddenDir);
		writeFileSync(join(hiddenDir, "cloud-config.yaml"), "priority: hidden");

		const originalCwd = process.cwd();
		process.chdir(testDir);

		try {
			const { resolveCloudConfig } = await import(
				"./cloud-config?t=" + Date.now()
			);
			const result = await resolveCloudConfig();
			expect(result).toBe("priority: cwd");
		} finally {
			process.chdir(originalCwd);
		}
	});

	test("MBP_CLOUD_CONFIG takes priority over CWD files", async () => {
		createTestDir();
		const envFile = join(testDir, "env-config.yaml");
		writeFileSync(envFile, "source: env");
		writeFileSync(join(testDir, "mbp-cloud-config.yaml"), "source: cwd");

		process.env.MBP_CLOUD_CONFIG = envFile;

		const originalCwd = process.cwd();
		process.chdir(testDir);

		try {
			const { resolveCloudConfig } = await import(
				"./cloud-config?t=" + Date.now()
			);
			const result = await resolveCloudConfig();
			expect(result).toBe("source: env");
		} finally {
			process.chdir(originalCwd);
		}
	});

	test("skips missing CWD files and falls through to default", async () => {
		createTestDir();

		const originalCwd = process.cwd();
		process.chdir(testDir);

		try {
			const { resolveCloudConfig } = await import(
				"./cloud-config?t=" + Date.now()
			);
			const result = await resolveCloudConfig();
			expect(result).toBe(DEFAULT_CLOUD_CONFIG);
		} finally {
			process.chdir(originalCwd);
		}
	});
});
