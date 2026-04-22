import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { ExecResult } from "./types";

const calls: string[][] = [];

mock.module("./cli", () => ({
  execMultipass: mock(async (args: string[]) => {
    calls.push(args);
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
    expect(calls[0]).toEqual(["exec", "testvm", "--", "bash", "-lc", "node app.js"]);
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
    expect(calls[0]).toEqual(["exec", "testvm", "--", "bash", "-c", "rm -rf ~/app/*"]);
    expect(calls[1]).toEqual(["transfer", "--recursive", "/host/path", "testvm:~/app/"]);
  });
});
