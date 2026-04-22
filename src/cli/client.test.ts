import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ExecResult } from "./types";

const calls: string[][] = [];

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
		return { stdout: "", stderr: "", exitCode: 0 } as ExecResult;
	}),
}));

mock.module("./cloud-config", () => ({
	writeCloudConfigTempFile: () => "/tmp/multibunpass-cloud-config.yaml",
	BUN_CLOUD_CONFIG: "",
}));

const { MultiBunPassClient } = await import("./client");
const { VM } = await import("./vm");

beforeEach(() => {
	calls.length = 0;
});

describe("MultiBunPassClient", () => {
	const client = new MultiBunPassClient();

	test("list parses JSON and returns VMInfo array", async () => {
		const vms = await client.list();
		expect(vms).toHaveLength(1);
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

	test("get returns VM instance without CLI calls", () => {
		const vm = client.get("myvm", "/host/folder");
		expect(vm).toBeInstanceOf(VM);
		expect(vm.name).toBe("myvm");
		expect(vm.folderPath).toBe("/host/folder");
		expect(vm.getLocalPath()).toBe("~/app/");
		expect(calls).toHaveLength(0);
	});

	test("get respects custom remotePath", () => {
		const vm = client.get("myvm", "/host/folder", "~/custom/");
		expect(vm.getLocalPath()).toBe("~/custom/");
	});

	test("create runs launch → cloud-init wait → transfer", async () => {
		const vm = await client.create("newvm", "/my/project");
		expect(vm).toBeInstanceOf(VM);
		expect(vm.name).toBe("newvm");

		const launchCall = calls.find((c) => c[0] === "launch");
		expect(launchCall).toBeDefined();
		expect(launchCall).toContain("--name");
		expect(launchCall).toContain("newvm");
		expect(launchCall).toContain("--cloud-init");

		const transferCall = calls.find((c) => c[0] === "transfer");
		expect(transferCall).toEqual([
			"transfer",
			"--recursive",
			"/my/project",
			"newvm:~/app/",
		]);
	});

	test("create uses custom remotePath", async () => {
		const _vm = await client.create("newvm", "/my/project", "~/src/");
		const transferCall = calls.find((c) => c[0] === "transfer");
		expect(transferCall).toContain("newvm:~/src/");
	});
});
