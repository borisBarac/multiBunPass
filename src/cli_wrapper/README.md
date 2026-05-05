# cli_wrapper

Core library module for MultiBunPass. Provides a TypeScript wrapper around the `multipass` CLI for programmatic VM management. Both the CLI (`src/cli/`) and MCP server (`src/mcp/`) consume this library.

## Overview

The module exposes a `MultiBunPassClient` for high-level VM lifecycle management and a `VM` class for per-VM operations. Lower-level primitives (`execMultipass`, parsers, cloud-config resolution) are also exported for direct use.

## API Reference

### MultiBunPassClient

```ts
import { MultiBunPassClient } from "./cli_wrapper";
```

| Method | Signature | Description |
|---|---|---|
| `list` | `list(): Promise<VMInfo[]>` | List all VMs via `multipass list --format json` |
| `create` | `create(name: string, localPath: string, remotePath?: string): Promise<VM>` | Full provisioning: launch Ubuntu LTS with `--bridged`, cloud-init with Bun, wait for init, transfer files, flatten directory. Auto-cleanup on failure. |
| `delete` | `delete(name: string): Promise<ExecResult>` | Delete and purge a VM |
| `info` | `info(name: string): Promise<VMDetailedInfo>` | Detailed VM info parsed from JSON |
| `get` | `get(name: string, localPath: string, remotePath?: string): Promise<VM>` | Get VM with pre-flight checks (exists + remote dir present). Throws descriptive errors on failure. |
| `getUnsafe` | `getUnsafe(name: string, localPath: string, remotePath?: string): VM` | Get VM without checks. Safe to use immediately after `create`. |
| `exists` | `exists(name: string): Promise<boolean>` | Check if a VM exists |
| `getStatus` | `getStatus(name: string): Promise<{ running: boolean }>` | Check if a VM is running |

### VM

```ts
import { VM } from "./cli_wrapper";
```

Properties: `name: string`, `localPath: string`, `remotePath: string`

| Method | Signature | Description |
|---|---|---|
| `exec` | `exec(command: string, options?: ExecOptions): Promise<ExecResult>` | Run a command inside the VM. Options: `streamPort` (TCP streaming), `cwd` (working dir, defaults to `remotePath`), `skipPreflight` (skip directory check). |
| `stop` | `stop(): Promise<ExecResult>` | Stop the VM |
| `start` | `start(): Promise<ExecResult>` | Start the VM |
| `isRunning` | `isRunning(): Promise<boolean>` | Check running state |
| `info` | `info(): Promise<VMDetailedInfo>` | Detailed VM info |
| `pushFiles` | `pushFiles(): Promise<ExecResult>` | Clear remote directory, transfer local files, flatten |

### execMultipass

```ts
execMultipass(args: string[], options?: ExecOptions): Promise<ExecResult>
```

Low-level primitive. Spawns `multipass` via `Bun.spawn` and captures stdout, stderr, and exit code. Supports optional `OutputWrapper` for TCP streaming.

## Cloud Config

Cloud-init configuration is resolved by `resolveCloudConfig()` in the following order:

1. `MBP_CLOUD_CONFIG` env var -- required if set; throws if the file is missing
2. `mbp-cloud-config.yaml` in the current working directory
3. `.multibunpass/cloud-config.yaml` in the current working directory
4. `~/.config/multibunpass/cloud-config.yaml`
5. Built-in default: Ubuntu LTS with `package_update: true`, installs `curl`/`unzip`, installs Bun via `curl -fsSL https://bun.sh/install`, adds Bun to PATH in `.profile`

Functions:

```ts
resolveCloudConfig(): string          // Resolve and return cloud-config YAML content
writeCloudConfigTempFile(): string    // Write resolved config to a temp file, return path
cleanupCloudConfigTempFile(): void    // Remove the temp file
```

## Internal Modules

- **cloud-init.ts** -- `waitForCloudInit(name)` polls up to 30 attempts (2s delay each) for `cloud-init status --wait`
- **parsers.ts** -- `parseVMInfo(name, json)` parses `multipass info --format json` output into `VMDetailedInfo`
- **utils.ts** -- `getDefaultRemotePath()` returns `MBP_REMOTE_PATH` or `~/app/`; `expandTilde(path)` expands `~/` to `/home/ubuntu/`; `shellEscape(s)` performs single-quote escaping
- **logger.ts** -- Logger class with levels `debug`, `info`, `warn`, `error`, `silent`, controlled by `LOG_LEVEL` env var (default: `warn`)

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `MBP_REMOTE_PATH` | Default remote path inside VMs | `~/app/` |
| `MBP_CLOUD_CONFIG` | Path to custom cloud-config YAML | -- |
| `LOG_LEVEL` | Logging verbosity: `debug`, `info`, `warn`, `error`, `silent` | `warn` |
| `TMPDIR` | Temp directory for cloud-config files | `/tmp` |
