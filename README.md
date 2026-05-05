# MultiBunPass

Spin up Bun-ready Ubuntu VMs in seconds. Develop, test, and run your code in isolated environments without leaving your terminal.

MultiBunPass wraps [Multipass](https://multipass.run/) to give you instant, disposable VMs with Bun pre-installed. Write code locally, push it to a VM, run it there. No Docker, no cloud accounts, no setup friction.

## Why MultiBunPass?

- **Zero-config Bun VMs** -- `mbp create my-app --local-path ./project` and you're done
- **Three interfaces** -- CLI for humans, SDK for programs, MCP server for AI agents
- **Automatic provisioning** -- Ubuntu LTS, Bun, cloud-init, file transfer, all handled for you
- **Bidirectional sync** -- push files to VMs, stream output back over TCP
- **Customizable VM provisioning** -- override the built-in cloud-init with your own YAML to install any packages, run scripts, or configure the VM however you need
- **Built for AI workflows** -- expose your VMs as MCP tools that any LLM can call

## Requirements

- macOS or Linux with [Multipass](https://multipass.run/) installed
- [Bun](https://bun.sh/) runtime

## Quick Start

### Install

```bash
bun install
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

### SDK (`cli_wrapper`)

Use MultiBunPass as a library in your own tools:

```ts
import { MultiBunPassClient } from "./cli_wrapper";

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
