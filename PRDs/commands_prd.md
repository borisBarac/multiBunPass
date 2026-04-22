# MultiBunPass - Implementation Checklist

## File Structure

```
src/
  cli.ts            # Low-level multipass CLI wrapper (Bun.spawn)
  cli.test.ts       # CLI wrapper tests
  vm.ts             # VM class (operations on a single instance)
  vm.test.ts        # VM class tests
  client.ts         # MultiBunPass client (entry point)
  client.test.ts    # Client tests
  types.ts          # Shared types
  cloud-config.ts   # Default cloud-config (bun-ready)
index.ts            # Public API re-exports
```

---

## 1. `src/types.ts` — Shared Types

- [x] Define `ExecResult` type: `{ stdout: string; stderr: string; exitCode: number }`
- [x] Define `VMInfo` type: parsed JSON from `multipass list --format json`
- [x] Define `CreateVMOptions` type: `{ name: string; folderPath: string; remotePath?: string }`

---

## 2. `src/cli.ts` — CLI Wrapper

- [x] Implement `execMultipass(args: string[]): Promise<ExecResult>` using `Bun.spawn()`
  - Spawn `multipass` with given args
  - Capture stdout + stderr
  - Resolve with `{ stdout, stderr, exitCode }`
  - Throw on non-zero exit code

---

## 3. `src/cloud-config.ts` — Default Cloud Config

- [x] Create embedded bun cloud-config YAML string based on `packer/cloud-config.yaml` format
  - `package_update: true`
  - Install `curl`
  - `runcmd`: install bun via `curl -fsSL https://bun.sh/install | bash`
  - Set up PATH for bun
- [x] Export as a constant string
- [x] Optionally write temp file for `--cloud-init` usage

---

## 4. `src/vm.ts` — VM Class

**Properties:**
- [x] `name: string`
- [x] `folderPath: string` (host-side path)
- [x] `remotePath: string` (VM-side path, default `~/app/`)

**Methods:**

### `vm.exec(command: string): Promise<ExecResult>`
- [x] Calls `cli.execMultipass(['exec', name, '--', 'bash', '-lc', command])`

### `vm.getLocalPath(): string`
- [x] Returns `this.remotePath` — no CLI call

### `vm.stop(): Promise<ExecResult>`
- [x] Calls `cli.execMultipass(['stop', name])`

### `vm.start(): Promise<ExecResult>`
- [x] Calls `cli.execMultipass(['start', name])`

### `vm.resync(): Promise<ExecResult>`
- [x] Clean remote dir: `cli.execMultipass(['exec', name, '--', 'bash', '-c', \`rm -rf ${remotePath}*\`])`
- [x] Re-transfer: `cli.execMultipass(['transfer', '--recursive', folderPath, \`${name}:${remotePath}\`])`

---

## 5. `src/client.ts` — MultiBunPass Client

### `client.list(): Promise<VMInfo[]>`
- [x] Calls `cli.execMultipass(['list', '--format', 'json'])`
- [x] Parse JSON response, return array of VM info

### `client.create(name, folderPath, remotePath?): Promise<VM>`
- [x] Resolve cloud-config path (write temp file from `cloud-config.ts`)
- [x] Launch: `cli.execMultipass(['launch', '24.04', '--name', name, '--cloud-init', configPath])`
- [x] Wait for cloud-init to complete
- [x] Transfer: `cli.execMultipass(['transfer', '--recursive', folderPath, \`${name}:${remotePath}\`])`
- [x] Return new `VM` instance

### `client.delete(name: string): Promise<ExecResult>`
- [x] Delete: `cli.execMultipass(['delete', name])`
- [x] Purge: `cli.execMultipass(['purge'])`

### `client.get(name, folderPath, remotePath?): VM`
- [x] Return a `VM` instance for an existing VM (no launch/transfer)

---

## 6. `index.ts` — Public API

- [x] Export `MultiBunPassClient` from `src/client.ts`
- [x] Export `VM` class from `src/vm.ts`
- [x] Export types from `src/types.ts`

---

## 7. Testing

Each implementation file gets a co-located `*.test.ts` using Bun's built-in test runner. Mock `Bun.spawn` to avoid needing a real multipass instance.

### `src/cli.test.ts`
- [x] Test `execMultipass` with successful command (exitCode 0)
- [x] Test `execMultipass` with failed command (non-zero exitCode)
- [x] Test args are passed correctly to spawn

### `src/vm.test.ts`
- [x] Test `vm.exec()` calls correct args
- [x] Test `vm.getLocalPath()` returns `remotePath`
- [x] Test `vm.stop()` calls correct args
- [x] Test `vm.start()` calls correct args
- [x] Test `vm.resync()` calls rm then transfer in sequence

### `src/client.test.ts`
- [x] Test `client.list()` parses JSON output
- [x] Test `client.create()` runs launch → wait → transfer sequence
- [x] Test `client.delete()` runs delete then purge
- [x] Test `client.get()` returns VM instance without CLI calls

### `package.json` update
- [x] Add `"test"` script: `"bun test"`
- [x] Add `"test:watch"` script: `"bun test --watch"`

---

## 8. Integration & Polish

- [ ] Error handling: VM not found, multipass not installed, VM already exists
- [ ] `resync()` edge cases (empty folder, missing remote dir)

---

All implementation in TypeScript throughout.
