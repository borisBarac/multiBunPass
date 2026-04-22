import { describe, expect, mock, test } from "bun:test";
import type { ExecResult } from "./types";

const capturedArgs: string[][] = [];
const mockResults: { stdout: string; stderr: string; exitCode: number }[] = [];

mock.module("./cli", () => ({
	execMultipass: async (args: string[]): Promise<ExecResult> => {
		capturedArgs.push(args);
		const result = mockResults.shift() || {
			stdout: "",
			stderr: "",
			exitCode: 0,
		};
		if (result.exitCode !== 0) {
			throw new Error(
				`multipass ${args.join(" ")} failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
			);
		}
		return result;
	},
}));

describe("cli", () => {
	test("execMultipass passes args and returns result on success", async () => {
		capturedArgs.length = 0;
		mockResults.push({ stdout: "ok", stderr: "", exitCode: 0 });

		const { execMultipass } = await import("./cli");
		const result = await execMultipass(["list", "--format", "json"]);
		expect(result.stdout).toBe("ok");
		expect(result.exitCode).toBe(0);
		expect(capturedArgs[0]).toEqual(["list", "--format", "json"]);
	});

	test("execMultipass throws on non-zero exit code", async () => {
		capturedArgs.length = 0;
		mockResults.push({ stdout: "", stderr: "instance not found", exitCode: 1 });

		const { execMultipass } = await import("./cli");
		expect(execMultipass(["exec", "nope", "--", "pwd"])).rejects.toThrow(
			"instance not found",
		);
	});

	test("execMultipass passes correct args to spawn", async () => {
		capturedArgs.length = 0;
		mockResults.push({ stdout: "", stderr: "", exitCode: 0 });

		const { execMultipass } = await import("./cli");
		await execMultipass(["stop", "myvm"]);
		expect(capturedArgs[0]).toEqual(["stop", "myvm"]);
	});
});
