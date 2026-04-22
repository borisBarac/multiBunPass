import { execMultipass } from "./cli";
import type { ExecResult } from "./types";

const DEFAULT_REMOTE_PATH = "~/app/";

export class VM {
  readonly name: string;
  readonly folderPath: string;
  readonly remotePath: string;

  constructor(name: string, folderPath: string, remotePath?: string) {
    this.name = name;
    this.folderPath = folderPath;
    this.remotePath = remotePath || DEFAULT_REMOTE_PATH;
  }

  async exec(command: string): Promise<ExecResult> {
    return execMultipass(["exec", this.name, "--", "bash", "-lc", command]);
  }

  getLocalPath(): string {
    return this.remotePath;
  }

  async stop(): Promise<ExecResult> {
    return execMultipass(["stop", this.name]);
  }

  async start(): Promise<ExecResult> {
    return execMultipass(["start", this.name]);
  }

  async resync(): Promise<ExecResult> {
    await execMultipass([
      "exec",
      this.name,
      "--",
      "bash",
      "-c",
      `rm -rf ${this.remotePath}*`,
    ]);
    return execMultipass([
      "transfer",
      "--recursive",
      this.folderPath,
      `${this.name}:${this.remotePath}`,
    ]);
  }
}
