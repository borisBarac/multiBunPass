# MultiBunPass — Bun REPL Quick Reference

Start a REPL from the project root:

```bash
cd MultiBunPass
bun repl
```

## Setup

```js
import { MultiBunPassClient } from "./src/cli_wrapper";
const client = new MultiBunPassClient();
```

## VM Lifecycle

### Create a VM

```js
const vm = await client.create("my-vm", "/path/to/local/folder", "~/app/");
// launches LTS Ubuntu, runs cloud-init, transfers folder contents
```

### List VMs

```js
const vms = await client.list();
// => [{ name, state, ipv4, image, release }, ...]
```

### Get a handle to an existing VM

```js
const vm = await client.get("my-vm", "/path/to/local/folder", "~/app/");
```

This verifies the VM exists and the remote directory is present. Throws if either check fails.

### Get a handle without checks

```js
const vm = client.getUnsafe("my-vm", "/path/to/local/folder");
```

Returns a `VM` instance immediately — no existence or directory checks. Use when you're certain the VM is ready (e.g. right after `create()`, or for start/stop/status operations).

### VM info

```js
const info = await client.info("my-vm");
// => { name, state, snapshots, ipv4, release, cpu_count, load, disk, memory, mounts }
```

### Stop / Start

```js
const vm = client.getUnsafe("my-vm", "./my-app");
await vm.stop();
await vm.start();
```

## Running Commands

`exec()` runs commands inside the VM's `remotePath` (`~/app/`) by default. A pre-flight check verifies the directory exists.

```js
const result = await vm.exec("bun --version");
// result.stdout, result.stderr, result.exitCode
```

```js
const result = await vm.exec("ls");
// lists files in ~/app/ (the default working directory)
```

### Override the working directory

```js
const result = await vm.exec("ls /tmp", { cwd: "/tmp" });
```

### Skip the pre-flight directory check

```js
const result = await vm.exec("bun test", { skipPreflight: true });
```

Use `skipPreflight` when you're certain the directory exists — saves one multipass call.

### Stream output over TCP

Start a listener in a separate terminal:

```bash
nc -l localhost 19876
```

Then stream command output to it:

```js
const result = await vm.exec("bun test", { streamPort: 19876 });
// output appears in the nc listener in real-time
```

## File Sync

`pushFiles()` clears the remote directory and re-transfers the local folder:

```js
await vm.pushFiles();
```

## Check if VM is running

```js
const running = await vm.isRunning();
```

## Cleanup

```js
await client.delete("my-vm"); // stops, deletes, and purges
```

## Reusing a VM across REPL sessions

If a VM already exists, you can reconnect without recreating:

```js
const vms = await client.list();
const existing = vms.find(v => v.name === "my-vm");

if (existing) {
  const vm = await client.get("my-vm", "./my-app");
  if (existing.state !== "Running") {
    await vm.start();
  }
  await vm.pushFiles(); // refresh files
} else {
  await client.create("my-vm", "./my-app");
}
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MBP_REMOTE_PATH` | `~/app/` | Default remote path for VMs |
| `MBP_LOG_LEVEL` | `info` | Log level (`debug`, `info`, `warn`, `error`) |
| `MBP_STREAM_HOST` | `127.0.0.1` | Default hostname for OutputWrapper |
| `MBP_STREAM_CONNECT_TIMEOUT` | `30000` | TCP connect timeout in ms |
