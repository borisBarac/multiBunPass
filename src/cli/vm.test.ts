import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ExecResult } from "./types";

const calls: string[][] = [];

mock.module("./cli", () => ({
	execMultipass: mock(async (args: string[]) => {
		calls.push(args);
		if (args[0] === "info") {
			return {
				stdout: JSON.stringify({
					info: {
						testvm: {
							state: "Running",
							snapshots: { count: 2 },
							ipv4: ["10.0.0.1"],
							release: { extended_status: "Ubuntu 24.04.4 LTS" },
							image_hash: "abc123",
							cpu_count: { total: 2 },
							load: [0.1, 0.2, 0.3],
							disk: { used: "1GiB", total: "10GiB" },
							memory: { used: "100MiB", total: "1GiB" },
							mounts: { "/host/path": {} },
						},
					},
				}),
				stderr: "",
				exitCode: 0,
			} as ExecResult;
		}
		return { stdout: "ok", stderr: "", exitCode: 0 } as ExecResult;
	}),
}));

const { VM } = await import("./vm");

beforeEach(() => {
	calls.length = 0;
});

describe("VM", () => {
	const vm = new VM("testvm", "/host/path", "~/app/");

	test("getLocalPath returns remotePath", () => {
		expect(vm.getLocalPath()).toBe("~/app/");
	});

	test("getLocalPath uses default when no remotePath provided", () => {
		const vmDefault = new VM("testvm", "/host/path");
		expect(vmDefault.getLocalPath()).toBe("~/app/");
	});

	test("exec calls multipass with bash -lc", async () => {
		await vm.exec("node app.js");
		expect(calls[0]).toEqual([
			"exec",
			"testvm",
			"--",
			"bash",
			"-lc",
			"node app.js",
		]);
	});

	test("stop calls multipass stop", async () => {
		await vm.stop();
		expect(calls[0]).toEqual(["stop", "testvm"]);
	});

	test("start calls multipass start", async () => {
		await vm.start();
		expect(calls[0]).toEqual(["start", "testvm"]);
	});

	test("resync calls rm then transfer in sequence", async () => {
		await vm.resync();
		expect(calls).toHaveLength(2);
		expect(calls[0]).toEqual([
			"exec",
			"testvm",
			"--",
			"bash",
			"-c",
			"rm -rf ~/app/*",
		]);
		expect(calls[1]).toEqual([
			"transfer",
			"--recursive",
			"/host/path",
			"testvm:~/app/",
		]);
	});

	test("info returns parsed VMDetailedInfo", async () => {
		const info = await vm.info();
		expect(info.name).toBe("testvm");
		expect(info.state).toBe("Running");
		expect(info.snapshots).toBe(2);
		expect(info.ipv4).toEqual(["10.0.0.1"]);
		expect(info.release).toBe("Ubuntu 24.04.4 LTS");
		expect(info.image_hash).toBe("abc123");
		expect(info.cpu_count).toBe(2);
		expect(info.load).toEqual([0.1, 0.2, 0.3]);
		expect(info.disk).toEqual({ used: "1GiB", total: "10GiB" });
		expect(info.memory).toEqual({ used: "100MiB", total: "1GiB" });
		expect(info.mounts).toEqual(["/host/path"]);
	});
});
