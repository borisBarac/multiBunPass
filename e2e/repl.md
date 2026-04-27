# MultiBunPass — Bun REPL Quick Reference

Start a REPL from the project root:

```bash
cd MultiBunPass
bun repl
```

## Setup

```js
const { MultiBunPassClient } = require("./src/cli_wrapper");
```

### Without streaming

```js
const client = new MultiBunPassClient();
await client.init();
```

### With streaming (TCP output wrapper)

First, start a TCP listener in a separate terminal:

```bash
nc -l localhost 19876
```

Then in the REPL:

```js
const client = new MultiBunPassClient({ stream: { port: 19876 } });
await client.init();
// Command output is piped to the nc listener in real-time
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
const vm = client.get("my-vm", "/path/to/local/folder", "~/app/");
```

This does not create anything — it just returns a `VM` object you can call methods on.

### VM info

```js
const info = await client.info("my-vm");
// => { name, state, snapshots, ipv4, release, cpu_count, load, disk, memory, mounts }
```

### Stop / Start

```js
const vm = client.get("my-vm", "./my-app");
await vm.stop();
await vm.start();
```

## Running Commands

```js
const result = await vm.exec("bun --version");
// result.stdout, result.stderr, result.exitCode
```

```js
const result = await vm.exec("ls ~/app/");
console.log(result.stdout);
```

## File Sync

`resync()` clears the remote path and re-transfers the local folder:

```js
await vm.resync();
```

## Check if VM is running

```js
const running = await vm.isRunning();
```

## Cleanup

```js
await client.delete("my-vm"); // stops, deletes, and purges
await client.close();          // shuts down streaming wrapper
```

## Reusing a VM across REPL sessions

If a VM already exists, you can reconnect without recreating:

```js
const vms = await client.list();
const existing = vms.find(v => v.name === "my-vm");

if (existing) {
  const vm = client.get("my-vm", "./my-app");
  if (existing.state !== "Running") {
    await vm.start();
  }
  await vm.resync(); // refresh files
} else {
  await client.create("my-vm", "./my-app");
}
```
