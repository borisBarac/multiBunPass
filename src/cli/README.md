# mbp CLI

The `mbp` command-line interface for MultiBunPass. A yargs-based CLI that wraps Multipass VMs for Bun development projects.

## Overview

`mbp` provides commands to create, manage, and interact with Multipass-based VMs tailored for Bun development. Every command supports a `--json` flag to switch from human-readable table output to raw JSON.

## Installation

The binary is registered as `mbp` via the `bin` field in `package.json`:

```json
"bin": { "mbp": "src/cli/index.ts" }
```

## Global Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--json` | boolean | `false` | Output raw JSON instead of formatted tables |

## Commands

### mbp list

List all VMs.

```
mbp list [--json]
```

### mbp create

Create a new VM.

```
mbp create <name> --local-path <path> [--remote-path <path>] [--json]
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `<name>` | yes | — | Name of the VM |
| `--local-path` | yes | — | Local project folder to mount |
| `--remote-path` | no | `~/app/` | Target path inside the VM |

### mbp delete

Delete and purge a VM.

```
mbp delete <name> [--json]
```

### mbp info

Show detailed VM information (CPU, memory, disk, IP, mounts, load).

```
mbp info <name> [--json]
```

### mbp start

Start a stopped VM. Checks that the VM exists before attempting to start.

```
mbp start <name> [--json]
```

### mbp stop

Stop a running VM. Checks that the VM exists before attempting to stop.

```
mbp stop <name> [--json]
```

### mbp status

Check whether a VM is running or stopped.

```
mbp status <name> [--json]
```

### mbp exec

Run a command inside a VM.

```
mbp exec <name> --local-path <path> [--remote-path <path>] [--stream-port <port>] [--cwd <dir>] [-- command...] [--json]
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `<name>` | yes | — | Name of the VM |
| `--local-path` | yes | — | Local project folder |
| `--remote-path` | no | `~/app/` | Target path inside the VM |
| `--stream-port` | no | — | TCP port for output streaming |
| `--cwd` | no | — | Working directory inside the VM |
| `-- command...` | no | — | Command to execute (after `--`) |

### mbp sync

Sync local files to a VM. Clears the remote directory first, then transfers files.

```
mbp sync <name> --local-path <path> [--remote-path <path>] [--json]
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `<name>` | yes | — | Name of the VM |
| `--local-path` | yes | — | Local project folder to sync |
| `--remote-path` | no | `~/app/` | Target path inside the VM |

## Examples

```sh
mbp create my-app --local-path ./my-project

mbp list

mbp list --json

mbp start my-app

mbp exec my-app --local-path ./my-project -- bun run dev

mbp exec my-app --local-path ./my-project --stream-port 8080 -- bun test

mbp sync my-app --local-path ./my-project

mbp info my-app

mbp status my-app

mbp stop my-app

mbp delete my-app
```

## Architecture

```
src/cli/
  index.ts         Entry point. Yargs setup, scriptName "mbp", strict mode, registers all commands.
  client-cli.ts    Creates a shared MultiBunPassClient instance used by all command handlers.
  format.ts        Table and pretty-print formatters (formatTable, formatList, formatInfo).
  cmds/            One file per command. Each exports command, describe, builder, and handler.
```

All command handlers follow the standard yargs module pattern. They receive parsed arguments, instantiate a client via `client-cli.ts`, and delegate formatting to `format.ts` unless `--json` is set.
