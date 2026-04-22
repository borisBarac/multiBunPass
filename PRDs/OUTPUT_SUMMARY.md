# OutputWrapper — Implementation Summary

## Overview

`OutputWrapper` is a TCP server component that streams subprocess output to a single connected client (e.g. `nc`). It integrates with the existing `cli.ts` command runner so all `multipass` commands can be streamed in real-time.

## Files Changed

| File | Change |
|---|---|
| `src/types.ts` | Added `OutputWrapperOptions` and `OutputWrapperStatus` types |
| `src/out_stream/index.ts` | New — full `OutputWrapper` class |
| `src/cli.ts` | Added `setOutputWrapper()` for integration |
| `index.ts` | Added exports for `OutputWrapper`, `setOutputWrapper`, and new types |

## Architecture

```
Command Runner (Bun.spawn)
       │
       ▼
  OutputWrapper  ←── TCP server on host:port
       │
       └──► 1 connected client (nc or any TCP client)
```

- We host a TCP server using `Bun.listen()`
- The listener connects to us (no `nc -l` needed on our side)
- **1 connection max** — additional clients are rejected
- Output is buffered until a client connects, then flushed

## `OutputWrapperOptions`

```ts
type OutputWrapperOptions = {
  host?: string;       // default "0.0.0.0"
  port: number;
  local?: boolean;     // also print to local console (default true)
};
```

## `OutputWrapper` API

| Method | Description |
|---|---|
| `constructor(opts)` | Configure host, port, local echo |
| `start()` | Start TCP server |
| `write(data)` | Send string or Uint8Array to connected client (buffers if no client) |
| `spawnAndWrap(cmd, opts?)` | Spawn a process, stream stdout+stderr to client, return `ExecResult` |
| `status()` | Returns `OutputWrapperStatus` (listening, clientConnected, bytesSent) |
| `close()` | Close client connection and stop server |

## `OutputWrapperStatus`

```ts
type OutputWrapperStatus = {
  listening: boolean;
  clientConnected: boolean;
  host: string;
  port: number;
  bytesSent: number;
};
```

## Integration with `cli.ts`

```ts
import { setOutputWrapper } from "./src/cli";
import { OutputWrapper } from "./src/out_stream";

const wrapper = new OutputWrapper({ port: 9090 });
await wrapper.start();

setOutputWrapper(wrapper);

// Now all execMultipass() calls stream output to the connected client
// while still returning ExecResult normally
```

When `setOutputWrapper(null)` is called, `cli.ts` reverts to its original buffered behavior.

## nc Cross-Platform Note

Since **we are the TCP server**, the `nc` cross-platform issue (`-l` vs `-l -p`) from `playground/nd.md` does **not** affect our code. The listener connects **to** us:

```bash
# Works identically on macOS AND Linux:
nc <our-host> <our-port>
```

The `-p` flag ambiguity only affects `nc` in **listen mode**, which we never use.

## Key Behaviors

| Scenario | Behavior |
|---|---|
| No client connected yet | Output buffered in memory |
| Client connects | Buffered data flushed, live streaming begins |
| Client disconnects | `client` reset to null, new output buffered again |
| Second client tries to connect | Immediately rejected (connection closed) |
| `local: true` (default) | Output also printed to local stdout |
| `local: false` | Output only sent to TCP client |
