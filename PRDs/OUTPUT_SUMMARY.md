# OutputWrapper — Implementation Summary

## Overview

`OutputWrapper` is a TCP client that connects to an external listener and streams subprocess output to it in real-time. It integrates with the existing `cli.ts` command runner so all `multipass` commands can be streamed over TCP.

## Files Changed

| File | Change |
|---|---|
| `src/cli_wrapper/types.ts` | Added `OutputWrapperOptions` and `OutputWrapperStatus` types |
| `src/out_stream/index.ts` | Full `OutputWrapper` class (TCP client) |
| `src/cli_wrapper/cli.ts` | Added `setOutputWrapper()` for integration |
| `index.ts` | Added exports for `OutputWrapper`, `setOutputWrapper`, and new types |

## Architecture

```
External listener (nc -l localhost 9090)
        │
        ▲
        │ TCP connection
        │
  OutputWrapper  ←── Bun.connect() to host:port
        │
        ▲
Command Runner (Bun.spawn)
```

- An external listener (e.g. `nc -l localhost <port>`) must be running **before** `OutputWrapper.start()`
- `OutputWrapper` connects to it using `Bun.connect()`
- Once connected, all subprocess output is written to the TCP socket in real-time
- If no listener is available, `start()` throws `ECONNREFUSED`

## `OutputWrapperOptions`

```ts
type OutputWrapperOptions = {
  host?: string;       // default "localhost"
  port: number;
  local?: boolean;     // also print to local console (default true)
};
```

## `OutputWrapper` API

| Method | Description |
|---|---|
| `constructor(opts)` | Configure host, port, local echo |
| `start()` | Connect to external TCP listener |
| `write(data)` | Send string or Uint8Array to connected listener |
| `spawnAndWrap(cmd, opts?)` | Spawn a process, stream stdout+stderr to listener, return `ExecResult` |
| `status()` | Returns `OutputWrapperStatus` (connected, host, port, bytesSent) |
| `close()` | Close TCP connection |

## `OutputWrapperStatus`

```ts
type OutputWrapperStatus = {
  connected: boolean;
  host: string;
  port: number;
  bytesSent: number;
};
```

## Integration with `cli.ts`

```ts
import { setOutputWrapper } from "./src/cli";
import { OutputWrapper } from "./src/out_stream";

// In terminal 1: nc -l localhost 9090

const wrapper = new OutputWrapper({ port: 9090 });
await wrapper.start(); // connects to nc

setOutputWrapper(wrapper);

// Now all execMultipass() calls stream output to the nc listener
// while still returning ExecResult normally
```

When `setOutputWrapper(null)` is called, `cli.ts` reverts to its original buffered behavior.

## Usage with VM.exec

```ts
// Terminal 1: nc -l localhost 3333
// Terminal 2:
const result = await vm.exec("ls -al", 3333);
// Output appears in the nc terminal in real-time
```

## nc Cross-Platform Note

Since `nc -l` behavior varies across platforms:

- **macOS / BSD**: `nc -l localhost <port>` works directly
- **Some Linux distros (OpenBSD netcat)**: May require `nc -l -p <port>` or `nc -l <port> <host>`

The default hostname `"localhost"` resolves via the OS and matches the address family that `nc` binds to (IPv4 or IPv6).

## Key Behaviors

| Scenario | Behavior |
|---|---|
| Listener not running | `start()` throws `ECONNREFUSED` |
| Connected successfully | Output streamed in real-time to listener |
| Listener disconnects mid-stream | `client` reset to null, subsequent writes are no-ops on TCP side |
| `local: true` (default) | Output also printed to local stdout |
| `local: false` | Output only sent to TCP listener |
| Custom connect timeout | Set `STREAM_CONNECT_TIMEOUT` env var (ms, default 30000) |
