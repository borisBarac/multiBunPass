import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ExecResult } from "./types";

const calls: string[][] = [];

mock.module("./cloud-config", () => ({
	writeCloudConfigTempFile: async () => "/tmp/multibunpass-cloud-config.yaml",
	cleanupCloudConfigTempFile: async () => {},
	BUN_CLOUD_CONFIG: "",
}));

mock.module("./cloud-init", () => ({
	waitForCloudInit: async () => {},
}));

mock.module("./cli", () => ({
	execMultipass: mock(async (args: string[]): Promise<ExecResult> => {
		calls.push(args);
		if (args[0] === "list") {
			return {
				stdout: JSON.stringify({
					list: [
						{
							name: "vm1",
							state: "Running",
							ipv4: ["192.168.1.5"],
							image: "24.04",
							release: "24.04",
						},
						{
							name: "myvm",
							state: "Running",
							ipv4: ["192.168.1.6"],
							image: "24.04",
							release: "24.04",
						},
					],
				}),
				stderr: "",
				exitCode: 0,
			} as ExecResult;
		}
		if (args[0] === "exec" && args.some((a) => a.includes("cloud-init"))) {
			return {
				stdout: "status: done\nDONE",
				stderr: "",
				exitCode: 0,
			} as ExecResult;
		}
		if (args[0] === "info") {
			return {
				stdout: JSON.stringify({
					info: {
						"renewed-kakapo": {
							state: "Running",
							snapshots: { count: 0 },
							ipv4: ["192.168.2.4", "192.168.0.196"],
							release: { extended_status: "Ubuntu 24.04.4 LTS" },
							image_hash: "1ea801e659d2",
							cpu_count: { total: 1 },
							load: [0.04, 0.06, 0.02],
							disk: { used: "2.1GiB", total: "4.8GiB" },
							memory: { used: "202.6MiB", total: "952.1MiB" },
							mounts: {},
						},
					},
				}),
				stderr: "",
				exitCode: 0,
			} as ExecResult;
		}
		return { stdout: "", stderr: "", exitCode: 0 } as ExecResult;
	}),
}));

const { MultiBunPassClient } = require("./client");
const { VM } = require("./vm");

beforeEach(() => {
	calls.length = 0;
});

describe("MultiBunPassClient", () => {
	const client = new MultiBunPassClient();

	test("list parses JSON and returns VMInfo array", async () => {
		const vms = await client.list();
		expect(vms).toHaveLength(2);
		expect(vms[0].name).toBe("vm1");
		expect(vms[0].state).toBe("Running");
		expect(vms[0].ipv4).toEqual(["192.168.1.5"]);
	});

	test("delete calls delete then purge", async () => {
		await client.delete("vm1");
		expect(calls).toHaveLength(2);
		expect(calls[0]).toEqual(["delete", "vm1"]);
		expect(calls[1]).toEqual(["purge"]);
	});

	test("get verifies VM exists and remote dir, returns VM", async () => {
		const vm = await client.get("myvm", "/host/folder");
		expect(vm).toBeInstanceOf(VM);
		expect(vm.name).toBe("myvm");
		expect(vm.localPath).toBe("/host/folder");
		expect(vm.remotePath).toBe("~/app/");

		const listCall = calls.find((c) => c[0] === "list");
		expect(listCall).toBeDefined();

		const testDirCall = calls.find(
			(c) => c[0] === "exec" && c.includes("test"),
		);
		expect(testDirCall).toBeDefined();
	});

	test("get throws if VM not found", async () => {
		expect(client.get("nonexistent", "/host/folder")).rejects.toThrow(
			'VM "nonexistent" not found',
		);
	});

	test("get throws if remote directory missing", async () => {
		const { execMultipass } = require("./cli");
		execMultipass.mockImplementationOnce(async (args: string[]) => {
			calls.push(args);
			return {
				stdout: JSON.stringify({
					list: [
						{
							name: "myvm",
							state: "Running",
							ipv4: [],
							image: "",
							release: "",
						},
					],
				}),
				stderr: "",
				exitCode: 0,
			} as ExecResult;
		});
		execMultipass.mockImplementationOnce(async (args: string[]) => {
			calls.push(args);
			throw new Error("multipass exec failed (exit 1)");
		});

		expect(client.get("myvm", "/host/folder")).rejects.toThrow(
			"does not exist",
		);
	});

	test("getUnsafe returns VM without any CLI calls", () => {
		const vm = client.getUnsafe("myvm", "/host/folder");
		expect(vm).toBeInstanceOf(VM);
		expect(vm.name).toBe("myvm");
		expect(vm.localPath).toBe("/host/folder");
		expect(vm.remotePath).toBe("~/app/");
		expect(calls).toHaveLength(0);
	});

	test("getUnsafe respects custom remotePath", () => {
		const vm = client.getUnsafe("myvm", "/host/folder", "~/custom/");
		expect(vm.remotePath).toBe("~/custom/");
	});

	test("create runs launch → cloud-init wait → transfer → verify", async () => {
		const vm = await client.create("newvm", "/my/project");
		expect(vm).toBeInstanceOf(VM);
		expect(vm.name).toBe("newvm");

		const launchCall = calls.find((c) => c[0] === "launch");
		expect(launchCall).toBeDefined();
		expect(launchCall).toContain("lts");
		expect(launchCall).toContain("--bridged");
		expect(launchCall).toContain("--name");
		expect(launchCall).toContain("newvm");
		expect(launchCall).toContain("--cloud-init");

		const transferCall = calls.find((c) => c[0] === "transfer");
		expect(transferCall).toEqual([
			"transfer",
			"--recursive",
			"/my/project",
			"newvm:/home/ubuntu/app/",
		]);
	});

	test("create uses custom remotePath", async () => {
		const _vm = await client.create("newvm", "/my/project", "~/src/");
		const transferCall = calls.find((c) => c[0] === "transfer");
		expect(transferCall).toContain("newvm:/home/ubuntu/src/");
	});

	test("info returns parsed VMDetailedInfo", async () => {
		const info = await client.info("renewed-kakapo");
		expect(info.name).toBe("renewed-kakapo");
		expect(info.state).toBe("Running");
		expect(info.snapshots).toBe(0);
		expect(info.ipv4).toEqual(["192.168.2.4", "192.168.0.196"]);
		expect(info.release).toBe("Ubuntu 24.04.4 LTS");
		expect(info.image_hash).toBe("1ea801e659d2");
		expect(info.cpu_count).toBe(1);
		expect(info.load).toEqual([0.04, 0.06, 0.02]);
		expect(info.disk).toEqual({ used: "2.1GiB", total: "4.8GiB" });
		expect(info.memory).toEqual({ used: "202.6MiB", total: "952.1MiB" });
		expect(info.mounts).toEqual([]);
	});
});
