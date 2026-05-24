# MultiBunPass

**Multipass is great, but the friction is real.** Spinning up a simple server (files + tool install) usually requires 5 or 6 commands and a custom `cloud-init` config. It's error-prone for humans, and even worse for AI agents—who frequently lose track of their environment.

**MultiBunPass** makes Multipass effortless. Get isolated, **Bun-preinstalled** Ubuntu VMs in seconds, designed specifically for rapid development sessions and AI workflows.

---

## Why MultiBunPass?

* **Zero-Config Bun VMs** – Every VM comes with **Bun installed** and ready to go. Run `mbp create` and start coding immediately.
* **Built for AI Agents** – Expose VMs via **MCP**. No more agents getting lost; they get a structured, reliable sandbox they can actually navigate.
* **TCP Output Streaming** – Stream command output directly to a TCP server for real-time monitoring and centralized logging.
* **Smart `exec` Commands** – Automatically loads profiles and environment variables so your scripts never fail due to missing paths.
* **Three Interfaces** – A **CLI** for humans, an **SDK** for programs, and an **MCP server** for LLMs.
* **Folder Sync** – Automatically push local files to your VM
* **Customizable** – Use the built-in defaults or override with your own `cloud-init` YAML for bespoke environments.

## Requirements

- macOS or Linux with [Multipass](https://multipass.run/) installed
- [Bun](https://bun.sh/) runtime

## Quick Start

### Install

```bash
bun add @boris.barac/multibunpass
```

For CLI and MCP server (global install):

```bash
bun add -g @boris.barac/multibunpass
```
### Create a VM and run your code

```bash
mbp create my-app --local-path ./my-project
mbp exec my-app --local-path ./my-project -- bun run dev
```

That's it. MultiBunPass launches an Ubuntu LTS VM, installs Bun via cloud-init, transfers your project into `~/app/`, and flattens the directory structure.

## Custom VM Setup

Don't like the defaults? Drop a `mbp-cloud-config.yaml` in your project to customize VM provisioning. Install Node.js, Python, databases, or anything else via standard cloud-init:

```yaml
#cloud-config
package_update: true
packages:
  - nodejs
  - postgresql
runcmd:
  - echo "your setup here"
```

Discovery order: `MBP_CLOUD_CONFIG` env var > `mbp-cloud-config.yaml` > `.multibunpass/cloud-config.yaml` > `~/.config/multibunpass/cloud-config.yaml` > built-in Bun default.

## Interfaces

MultiBunPass provides three ways to interact with your VMs:

### CLI (`mbp`)

```bash
mbp list                                    # list all VMs
mbp create my-app --local-path ./project    # create + provision
mbp exec my-app --local-path ./project -- bun test  # run commands
mbp sync my-app --local-path ./project      # re-sync files
mbp info my-app                             # CPU, memory, disk, IP
mbp status my-app                           # running or stopped
mbp stop my-app                             # stop
mbp start my-app                            # restart
mbp delete my-app                           # permanently remove
```

Every command supports `--json` for machine-readable output.

### TCP Output Streaming


Works with any TCP server. The `exec` command connects to the port and pipes stdout/stderr in real time.

**No SSH required.** The VM runs your server, but stdout/stderr are streamed back to your machine over a plain TCP socket — no SSH keys, no remote shells, no connection management. For AI agents this is especially useful: they can start a TCP listener, run `exec` with `--stream-port`, and read structured output directly from the socket without juggling SSH sessions or parsing remote terminal output.

Stream command output to a TCP listener for real-time monitoring or centralized logging:

```bash
# Terminal 1: start a listener
nc -l localhost 8080

# Terminal 2: run with streaming
mbp exec my-app --local-path ./project --stream-port 8080 -- bun test
```


### SDK (`cli_wrapper`)

Use MultiBunPass as a library in your own tools:

```ts
import { MultiBunPassClient } from "@boris.barac/multibunpass";

const client = new MultiBunPassClient();

const vm = await client.create("my-app", "/path/to/project");
await vm.exec("bun test");
const info = await vm.info();
await vm.pushFiles(); // re-sync after local changes
await client.delete("my-app");
```

### MCP Server (`multibunpass-mcp`)

Expose VM management as tools for AI agents via the Model Context Protocol:

```json
{
  "mcpServers": {
    "multibunpass": {
      "command": "multibunpass-mcp"
    }
  }
}
```

Your AI agent can create VMs, push code, run commands, and manage lifecycle -- all through structured tool calls with schema validation.

## How It Works

```
┌──────────────────────────────────────────────────┐
│                  Your Machine                     │
│                                                   │
│  ┌─────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │   CLI   │  │  MCP Server  │  │  Your Code   │ │
│  │  (mbp)  │  │  (stdio)     │  │  (SDK)       │ │
│  └────┬────┘  └──────┬───────┘  └──────┬───────┘ │
│       │              │                 │          │
│       └──────────────┼─────────────────┘          │
│                      │                            │
│              ┌───────┴───────┐                    │
│              │  cli_wrapper  │                    │
│              │  (SDK core)   │                    │
│              └───────┬───────┘                    │
│                      │ execMultipass()            │
└──────────────────────┼────────────────────────────┘
                       │
              ┌────────┴────────┐
              │   Multipass     │
              │   (local VMs)   │
              │                 │
              │  ┌───────────┐  │
              │  │  Ubuntu   │  │
              │  │  + Bun    │  │
              │  │  ~/app/   │  │
              │  └───────────┘  │
              └─────────────────┘
```

## Documentation

| Module | Description | README |
|--------|-------------|--------|
| **CLI** | `mbp` command-line interface with 9 commands | [`src/cli/README.md`](src/cli/README.md) |
| **SDK** | `MultiBunPassClient` and `VM` class API, types, cloud-config | [`src/cli_wrapper/README.md`](src/cli_wrapper/README.md) |
| **MCP Server** | 8 AI tools with Zod schemas, Claude Desktop integration | [`src/mcp/README.md`](src/mcp/README.md) |

## Configuration

MultiBunPass is zero-config out of the box. Customize with environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `MBP_REMOTE_PATH` | Default remote path inside VMs | `~/app/` |
| `MBP_CLOUD_CONFIG` | Path to custom cloud-init YAML | auto-discovered |
| `LOG_LEVEL` | Verbosity: `debug`, `info`, `warn`, `error`, `silent` | `warn` |

Cloud-init config is auto-discovered from `mbp-cloud-config.yaml`, `.multibunpass/cloud-config.yaml`, or `~/.config/multibunpass/cloud-config.yaml`. Falls back to the built-in Bun installer.

## Scripts

```bash
bun test              # unit tests
bun run test-e2e      # end-to-end tests (requires Multipass)
bun run lint          # biome check
bun run format:fix    # biome format
bun run typecheck     # TypeScript check
```
