import type { OutputWrapper } from "../out_stream";
import type { ExecResult } from "./types";

let outputWrapper: OutputWrapper | null = null;

export function setOutputWrapper(wrapper: OutputWrapper | null): void {
	outputWrapper = wrapper;
}

export async function execMultipass(args: string[]): Promise<ExecResult> {
	if (outputWrapper) {
		return outputWrapper.spawnAndWrap(["multipass", ...args]);
	}

	const proc = Bun.spawn(["multipass", ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});

	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;

	if (exitCode !== 0) {
		throw new Error(
			`multipass ${args.join(" ")} failed (exit ${exitCode}): ${stderr || stdout}`,
		);
	}

	return { stdout, stderr, exitCode };
}
