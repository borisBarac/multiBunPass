import type { ExecResult } from "./types";

export async function execMultipass(args: string[]): Promise<ExecResult> {
  const proc = Bun.spawn(["multipass", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(
      `multipass ${args.join(" ")} failed (exit ${exitCode}): ${stderr || stdout}`
    );
  }

  return { stdout, stderr, exitCode };
}
