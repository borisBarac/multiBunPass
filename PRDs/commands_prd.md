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

- [ ] Define `ExecResult` type: `{ stdout: string; stderr: string; exitCode: number }`
- [ ] Define `VMInfo` type: parsed JSON from `multipass list --format json`
- [ ] Define `CreateVMOptions` type: `{ name: string; folderPath: string; remotePath?: string }`

---

## 2. `src/cli.ts` — CLI Wrapper

- [ ] Implement `execMultipass(args: string[]): Promise<ExecResult>` using `Bun.spawn()`
  - Spawn `multipass` with given args
  - Capture stdout + stderr
  - Resolve with `{ stdout, stderr, exitCode }`
  - Throw on non-zero exit code

---

## 3. `src/cloud-config.ts` — Default Cloud Config

- [ ] Create embedded bun cloud-config YAML string based on `packer/cloud-config.yaml` format
  - `package_update: true`
  - Install `curl`
  - `runcmd`: install bun via `curl -fsSL https://bun.sh/install | bash`
  - Set up PATH for bun
- [ ] Export as a constant string
- [ ] Optionally write temp file for `--cloud-init` usage

---

## 4. `src/vm.ts` — VM Class

**Properties:**
- [ ] `name: string`
- [ ] `folderPath: string` (host-side path)
- [ ] `remotePath: string` (VM-side path, default `~/app/`)

**Methods:**

### `vm.exec(command: string): Promise<ExecResult>`
- [ ] Calls `cli.execMultipass(['exec', name, '--', 'bash', '-lc', command])`

### `vm.getLocalPath(): string`
- [ ] Returns `this.remotePath` — no CLI call

### `vm.stop(): Promise<ExecResult>`
- [ ] Calls `cli.execMultipass(['stop', name])`

### `vm.start(): Promise<ExecResult>`
- [ ] Calls `cli.execMultipass(['start', name])`

### `vm.resync(): Promise<ExecResult>`
- [ ] Clean remote dir: `cli.execMultipass(['exec', name, '--', 'rm', '-rf', \`${remotePath}/*\`])`
- [ ] Re-transfer: `cli.execMultipass(['transfer', '--recursive', folderPath, \`${name}:${remotePath}\`])`

---

## 5. `src/client.ts` — MultiBunPass Client

### `client.list(): Promise<VMInfo[]>`
- [ ] Calls `cli.execMultipass(['list', '--format', 'json'])`
- [ ] Parse JSON response, return array of VM info

### `client.create(name, folderPath, remotePath?): Promise<VM>`
- [ ] Resolve cloud-config path (write temp file from `cloud-config.ts`)
- [ ] Launch: `cli.execMultipass(['launch', '24.04', '--name', name, '--cloud-init', configPath])`
- [ ] Wait for cloud-init to complete
- [ ] Transfer: `cli.execMultipass(['transfer', '--recursive', folderPath, \`${name}:${remotePath}\`])`
- [ ] Return new `VM` instance

### `client.delete(name: string): Promise<ExecResult>`
- [ ] Delete: `cli.execMultipass(['delete', name])`
- [ ] Purge: `cli.execMultipass(['purge'])`

### `client.get(name, folderPath, remotePath?): VM`
- [ ] Return a `VM` instance for an existing VM (no launch/transfer)

---

## 6. `index.ts` — Public API

- [ ] Export `MultiBunPassClient` from `src/client.ts`
- [ ] Export `VM` class from `src/vm.ts`
- [ ] Export types from `src/types.ts`

---

## 7. Testing

Each implementation file gets a co-located `*.test.ts` using Bun's built-in test runner. Mock `Bun.spawn` to avoid needing a real multipass instance.

### `src/cli.test.ts`
- [ ] Test `execMultipass` with successful command (exitCode 0)
- [ ] Test `execMultipass` with failed command (non-zero exitCode)
- [ ] Test args are passed correctly to spawn

### `src/vm.test.ts`
- [ ] Test `vm.exec()` calls correct args
- [ ] Test `vm.getLocalPath()` returns `remotePath`
- [ ] Test `vm.stop()` calls correct args
- [ ] Test `vm.start()` calls correct args
- [ ] Test `vm.resync()` calls rm then transfer in sequence

### `src/client.test.ts`
- [ ] Test `client.list()` parses JSON output
- [ ] Test `client.create()` runs launch → wait → transfer sequence
- [ ] Test `client.delete()` runs delete then purge
- [ ] Test `client.get()` returns VM instance without CLI calls

### `package.json` update
- [ ] Add `"test"` script: `"bun test"`
- [ ] Add `"test:watch"` script: `"bun test --watch"`

---

## 8. Integration & Polish

- [ ] Error handling: VM not found, multipass not installed, VM already exists
- [ ] `resync()` edge cases (empty folder, missing remote dir)

---

All implementation in TypeScript throughout.
