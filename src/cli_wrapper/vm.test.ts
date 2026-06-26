import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ExecResult } from "./types";

const calls: string[][] = [];

mock.module("./cli", () => ({
	setOutputWrapper: () => {},
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

const { VM } = require("./vm");

beforeEach(() => {
	calls.length = 0;
});

describe("VM", () => {
	const vm = new VM("testvm", "/host/path", "~/app/");

	test("normalizes remotePath with a trailing slash", () => {
		const customVm = new VM("testvm", "/host/path", "/srv/app");
		expect(customVm.remotePath).toBe("/srv/app/");
	});

	test("exec pre-flights cwd check and runs command with cd", async () => {
		await vm.exec("node app.js");
		expect(calls).toHaveLength(2);
		expect(calls[0]).toEqual([
			"exec",
			"testvm",
			"--",
			"bash",
			"-lc",
			"test -d '/home/ubuntu/app/'",
		]);
		expect(calls[1]).toEqual([
			"exec",
			"testvm",
			"--",
			"bash",
			"-lc",
			"source ~/.profile && cd '/home/ubuntu/app/' && node app.js",
		]);
	});

	test("exec with custom cwd", async () => {
		await vm.exec("ls", { cwd: "/tmp" });
		expect(calls[1]).toEqual([
			"exec",
			"testvm",
			"--",
			"bash",
			"-lc",
			"source ~/.profile && cd '/tmp' && ls",
		]);
	});

	test("exec returns error when cwd does not exist", async () => {
		const { execMultipass } = require("./cli");
		execMultipass.mockImplementationOnce(async (args: string[]) => {
			calls.push(args);
			throw new Error("multipass exec failed (exit 1)");
		});

		const result = await vm.exec("node app.js", { cwd: "/nonexistent" });
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("does not exist");
		expect(result.stderr).toContain("pushFiles()");
	});

	test("stop calls multipass stop", async () => {
		await vm.stop();
		expect(calls[0]).toEqual(["stop", "testvm"]);
	});

	test("start calls multipass start", async () => {
		await vm.start();
		expect(calls[0]).toEqual(["start", "testvm"]);
	});

	test("pushFiles calls rm then transfer then flatten", async () => {
		await vm.pushFiles();
		expect(calls).toHaveLength(3);
		expect(calls[0]).toEqual([
			"exec",
			"testvm",
			"--",
			"bash",
			"-lc",
			"shopt -s dotglob nullglob && rm -rf -- '/home/ubuntu/app/'*",
		]);
		expect(calls[1]).toEqual([
			"transfer",
			"--recursive",
			"/host/path",
			"testvm:/home/ubuntu/app/",
		]);
		expect(calls[2]).toEqual([
			"exec",
			"testvm",
			"--",
			"bash",
			"-lc",
			"shopt -s dotglob && mv '/home/ubuntu/app/path'/* '/home/ubuntu/app/' && rmdir '/home/ubuntu/app/path'",
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
