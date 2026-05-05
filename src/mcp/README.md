# MultiBunPass MCP Server

A Model Context Protocol (MCP) server that exposes MultiBunPass VM management as AI tool calls over stdio transport. Allows LLM clients to create, manage, and interact with Bun-equipped virtual machines through Multipass.

## Running

```bash
multibunpass-mcp
```

Or run directly:

```bash
bun src/mcp/index.ts
```

The server communicates over stdio -- it reads JSON-RPC from stdin and writes responses to stdout.

## Architecture

```
src/mcp/
  index.ts           Entry point, stdio transport
  server.ts          Creates McpServer, registers all tools
  schemas.ts         Zod input schemas
  tools/
    vm_lifecycle.ts  vm_list, vm_create, vm_delete, vm_info
    vm_state.ts      vm_start, vm_stop, vm_status
    vm_exec.ts       vm_exec (with timeout support)
    vm_sync.ts       vm_sync
```

The server instantiates a `MultiBunPassClient` from the internal `cli_wrapper` module and wires each tool to the corresponding client method.

### Dependencies

- `@modelcontextprotocol/server` -- MCP server SDK
- `zod` -- input schema validation
- `cli_wrapper` (internal) -- Multipass CLI interaction layer

## Tools Reference

All tools return results in the standard MCP content format:

```json
{ "content": [{ "type": "text", "text": "<JSON string>" }] }
```

On error, responses include `"isError": true`.

---

### vm_list

Lists all VMs.

**Input:** none

**Output:**

```json
[{ "name": "...", ... }]
```

Array of VM objects.

---

### vm_create

Launches a new VM with Bun pre-installed and transfers the local project into it.

**Input:**

| Parameter   | Type   | Required | Description                        |
|-------------|--------|----------|------------------------------------|
| name        | string | yes      | VM name                           |
| localPath   | string | yes      | Path to local project directory   |
| remotePath  | string | no       | Destination path inside the VM    |

**Output:**

```json
{ "success": true, "name": "my-vm" }
```

---

### vm_delete

Permanently deletes and purges a VM.

**Input:**

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| name      | string | yes      | VM name     |

**Output:**

```json
{ "success": true, "name": "my-vm" }
```

---

### vm_info

Returns detailed VM information including CPU, memory, disk, IP, mounts, and load.

**Input:**

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| name      | string | yes      | VM name     |

**Output:** `VMDetailedInfo` JSON object with hardware and network details.

---

### vm_start

Starts a stopped VM.

**Input:**

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| name      | string | yes      | VM name     |

**Output:**

```json
{ "success": true, "name": "my-vm" }
```

---

### vm_stop

Stops a running VM.

**Input:**

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| name      | string | yes      | VM name     |

**Output:**

```json
{ "success": true, "name": "my-vm" }
```

---

### vm_status

Checks whether a VM is currently running.

**Input:**

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| name      | string | yes      | VM name     |

**Output:**

```json
{ "name": "my-vm", "running": true }
```

---

### vm_exec

Runs a shell command inside a VM.

**Input:**

| Parameter   | Type   | Required | Default | Description                  |
|-------------|--------|----------|---------|------------------------------|
| name        | string | yes      |         | VM name                     |
| command     | string | yes      |         | Shell command to execute    |
| localPath   | string | no       |         | Local path (for file sync)  |
| remotePath  | string | no       |         | Remote path (for file sync) |
| timeout     | number | no       | 60      | Timeout in seconds          |

**Output:**

```json
{
  "stdout": "output",
  "stderr": "",
  "exitCode": 0,
  "timedOut": false
}
```

If the command exceeds the timeout, `timedOut` is `true`.

---

### vm_sync

Re-transfers local code to the VM. Clears the remote directory before syncing.

**Input:**

| Parameter  | Type   | Required | Description                     |
|------------|--------|----------|---------------------------------|
| name       | string | yes      | VM name                        |
| localPath  | string | yes      | Path to local project directory |
| remotePath | string | no       | Destination path inside the VM  |

**Output:**

```json
{ "success": true, "name": "my-vm" }
```

## Integration Example

To use this server with Claude Desktop, add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "multibunpass": {
      "command": "multibunpass-mcp",
      "args": []
    }
  }
}
```

If running from source:

```json
{
  "mcpServers": {
    "multibunpass": {
      "command": "bun",
      "args": ["run", "/path/to/MultiBunPass/src/mcp/index.ts"]
    }
  }
}
```

The server uses stdio transport, so no port configuration is needed. The client spawns the process and communicates over its stdin/stdout.
