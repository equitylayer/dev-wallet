# Smart Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every DevWallet dev account an Ambire-style Kernel v3.3 smart account (EIP-7702, same address). It gets
real EIP-5792 v2 batching, built-in gas sponsorship, a batch queue, and hidden plain-EOA modes. The work also fixes
error fidelity and the listed bugs.

**Architecture:**
- All smart-account logic lives in a new, chrome-free module tree `src/smart/`. It talks to the node through a small
  `Node` interface (Anvil/Hardhat method translation), so every rule is tested against a real Anvil with `bun test`.
- The background service worker (`src/entries/background/`) becomes thin glue. It maps stores, approvals and messengers
  onto `src/smart/wallet-core.ts`.
- The UI asks the background for an execution preview, so approval screens show exactly what will happen.

**Tech Stack:** TypeScript, React 18, zustand (persisted to `chrome.storage.local`), viem 2.57 (incl.
`viem/account-abstraction`), bun test, Foundry (Anvil 1.7.1, forge), Hardhat 3 (EDR) for opt-in parity tests.

**Spec:** `docs/superpowers/specs/2026-11-01-smart-accounts-design.md` (read it before any task; section numbers below
are the spec's).

## Global Constraints

- Canonical addresses:
  - EntryPoint v0.7: `0x0000000071727De22E5E9d8BAf0edAc6f37da032`
  - SenderCreator: `0xEFC2c1444eBCC4Db75e7613d20C6a62fF67A167C`
  - Kernel v3.3: `0xd6CEDDe84be40893d153Be9d467CD6aD37875b28`
- A Kernel delegation is code exactly `0xef0100d6cedde84be40893d153be9d467cd6ad37875b28` (compare case-insensitively).
- DevWallet sponsor is `0xA346eBFABDf8D996e8c050431bb1F3E6221c45F3`, the last 20 bytes of `keccak256("devwallet.sponsor")`.
- DevWallet paymaster is `0x281D3b7F84120F81CD8D11CC95926663245c2765`, the last 20 bytes of
  `keccak256("devwallet.paymaster")`.
- Kernel `execute(bytes32,bytes)`:
  - selector `0xe9ae5c53`
  - batch mode `0x01` followed by 31 zero bytes (callType batch, execType revert-on-failure)
  - calldata `abi.encode((address,uint256,bytes)[])`
- Kernel user-op signature: the node's `eth_sign(sender, userOpHash)`. That is 65 bytes, no prefix byte, nonce key 0.
- ERC-1271 magic value: `0x1626ba7e`.
- DevWallet never holds private keys, never requires an external service, and never wraps signatures.
- EIP-5792:
  - only `version: "2.0.0"`
  - status codes `100` pending, `200` success, `400` failed before sending, `500` reverted, `600` partially reverted
- Error codes:
  - `4001` user rejected
  - `4100` unauthorized / unknown `from`
  - `4200` unsupported method
  - `5700` unsupported non-optional capability
  - `5710` unsupported chain id
  - `5720` duplicate id
  - `5730` unknown bundle id
  - `5750` upgrade rejected
  - `5760` atomicity not supported
  - `3` predicted revert (revert data in `data`)
  - `-32602` invalid params
  - `-32603` internal
- Never pass bigints through zustand persistence or messengers. Use hex strings (`RpcCall`, serialized previews).
- UI layout and styling belong to the UX agent. UI steps specify the information and actions that must exist, built
  with existing `~/design-system` and `~/components` parts. Don't restyle anything.
- Integration tests spawn their own Anvil (`src/smart/testing/anvil.ts`). Hardhat parity tests run only when
  `HARDHAT_RPC_URL` is set (`test.skipIf(!process.env.HARDHAT_RPC_URL)`).
- The test command is `bun test src/` (the repo's `bun run test`). `bun run typecheck` and `bun run lint` must pass at
  the end of every task.

## Review Focus

1. **The node is restarted or reset mid-session** (the sidebar still says Smart, but the chain lost the code). The next
   dApp request must re-install the contracts, re-apply the delegation, and clear that network's batch records. The
   test is in Task 10.
2. **Interval or no-automine mining.** d1 runs `--block-time 10 --mixed-mining`, and some people turn automine off.
   `wallet_getCallsStatus` must report `100` until the transaction is mined and `200` after it, with no hang. The test
   is in Task 8.
3. **A `wallet_sendCalls` with a `from` that isn't the active account.** A known DevWallet account on this network is
   used as given. An unknown address gets `4100`. The test is in Task 8.
4. **The chosen sponsor can't pay** (a picked account with a tiny balance). The send still happens, paid by the account,
   with a `fallbackReason` the approval screen shows. It must never fail outright. The test is in Task 7.
5. **The network is switched, or the service worker restarts, while a batch is open.** Every waiting dApp request is
   rejected with `4001`, and no queued item is left orphaned in the sidebar. The test is in Task 11.

---

### Task 1: Node layer, test harness, chain-id fix

**Files:**
- Create: `src/smart/types.ts`, `src/smart/errors.ts`, `src/smart/node.ts`, `src/smart/testing/anvil.ts`
- Test: `src/smart/node.test.ts`
- Modify: `src/viem.ts` (`buildChain`, `getClient`), `src/hooks/useClient.ts`, and `src/entries/background/rpc.ts`
  (`execute()`), so that every passthrough request uses `nodeMethod`

**Interfaces:**
- Produces:
  - `src/smart/types.ts`:
    - `type Call = { to?: Address; value?: bigint; data?: Hex }`
    - `type RpcCall = { to?: Address; value?: Hex; data?: Hex }`
    - `toCall(c: RpcCall): Call`
    - `toRpcCall(c: Call): RpcCall`
    - `type AccountMode = 'smart' | 'plain-upgradable' | 'plain-never'`
    - `type OnchainKind = { kind: 'eoa' } | { kind: 'kernel' } | { kind: 'delegated'; target: Address } | { kind: 'contract' }`
    - `type AtomicStatus = 'supported' | 'ready' | 'unsupported'`
    - `type SponsorSetting = { kind: 'devwallet' } | { kind: 'account'; address: Address } | { kind: 'off' }`
  - `src/smart/errors.ts`:
    - `class WalletRpcError extends Error { code: number; data?: unknown; constructor(code: number, message: string, data?: unknown) }`
    - `serializeError(e: unknown): { code: number; message: string; data?: unknown }` (unknown errors map to `-32603`)
  - `src/smart/node.ts`:
    - `type NodeKind = 'anvil' | 'hardhat'`
    - `type Node = { rpcUrl: string; kind: NodeKind; request<T = unknown>(method: string, params?: unknown[]): Promise<T>; chainId(): Promise<number>; blockNumber(): Promise<bigint>; getCode(a: Address): Promise<Hex>; setCode(a: Address, code: Hex): Promise<void>; getBalance(a: Address): Promise<bigint>; setBalance(a: Address, wei: bigint): Promise<void>; impersonate(a: Address): Promise<void> }`
    - `connectNode({ rpcUrl }: { rpcUrl: string }): Promise<Node>`, cached per rpcUrl
    - `nodeMethod(kind: NodeKind, method: string): string`
  - `src/smart/testing/anvil.ts`:
    - `startAnvil(args?: string[]): Promise<{ rpcUrl: string; stop(): Promise<void> }>`
    - `DEV_ACCOUNTS: readonly Address[]`, Anvil's default accounts 0–9

- [ ] **Step 1: Write the failing tests** in `src/smart/node.test.ts`. Every later integration test file uses this
  `beforeAll`/`afterAll` pattern.

```ts
let anvil: { rpcUrl: string; stop(): Promise<void> }
let node: Node
beforeAll(async () => { anvil = await startAnvil(); node = await connectNode({ rpcUrl: anvil.rpcUrl }) })
afterAll(() => anvil.stop())

test('detects anvil and its chain id', async () => {
  expect(node.kind).toBe('anvil')
  expect(await node.chainId()).toBe(31337)
})
test('translates cheat methods per node', () => {
  expect(nodeMethod('hardhat', 'anvil_setCode')).toBe('hardhat_setCode')
  expect(nodeMethod('hardhat', 'anvil_getAutomine')).toBe('hardhat_getAutomine')
  expect(nodeMethod('hardhat', 'anvil_impersonateAccount')).toBe('hardhat_impersonateAccount')
  expect(nodeMethod('hardhat', 'evm_mine')).toBe('evm_mine')
  expect(nodeMethod('anvil', 'anvil_setCode')).toBe('anvil_setCode')
  expect(nodeMethod('hardhat', 'eth_call')).toBe('eth_call')
})
test('setCode/getCode round-trip; empty code is 0x', async () => {
  const a = '0x000000000000000000000000000000000000c0de'
  expect(await node.getCode(a)).toBe('0x')
  await node.setCode(a, '0x6000')
  expect(await node.getCode(a)).toBe('0x6000')
})
test('node errors keep their code', async () => {
  const err = await node.request('eth_doesNotExist').catch((e) => e)
  expect(err).toBeInstanceOf(WalletRpcError)
  expect(err.code).toBe(-32601)
})
test.skipIf(!process.env.HARDHAT_RPC_URL)('detects hardhat and setCode works', async () => {
  const hh = await connectNode({ rpcUrl: process.env.HARDHAT_RPC_URL! })
  expect(hh.kind).toBe('hardhat')
  await hh.setCode('0x000000000000000000000000000000000000c0de', '0x6000')
  expect(await hh.getCode('0x000000000000000000000000000000000000c0de')).toBe('0x6000')
})
test('buildChain uses the given chain id', () => {
  expect(buildChain({ rpcUrl: 'http://x', chainId: 31337 }).id).toBe(31337)
})
```

- [ ] **Step 2: Run them to see them fail.** Run `bun test src/smart/node.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.**
  - `connectNode` detects the node with `web3_clientVersion`: a result starting `anvil` means Anvil, and one containing
    `hardhat` or `edr` (case-insensitive) means Hardhat. Anything else defaults to Anvil.
  - Use `getHttpRpcClient` from `viem/utils`, as `rpc.ts` already does.
  - `nodeMethod` maps `anvil_` to `hardhat_` for exactly these suffixes: `setCode`, `setBalance`, `setNonce`,
    `setStorageAt`, `impersonateAccount`, `stopImpersonatingAccount`, `mine`, `getAutomine`, `reset`, `dropTransaction`,
    `setCoinbase`, `setMinGasPrice`, `setNextBlockBaseFeePerGas`, `setLoggingEnabled`. Everything else passes through
    unchanged.
  - `startAnvil` spawns `anvil --port <random 20000–40000> --silent` (plus `args`) with `Bun.spawn`, and polls
    `eth_chainId` until it answers.
  - `buildChain({ rpcUrl, chainId = 31337 })`, `getClient({ rpcUrl, chainId? })` cached per `${rpcUrl}.${chainId}`, and
    `useClient` passes `network.chainId`.
  - In `rpc.ts` `execute()`, rewrite `request.method` through `nodeMethod((await connectNode({ rpcUrl })).kind, method)`
    before the passthrough. That makes the existing `testActions({ mode: 'anvil' })` UI cheats work on Hardhat.
- [ ] **Step 4: Run the tests to see them pass.** Run `bun test src/smart/node.test.ts`. Expected: PASS (the Hardhat
  test is skipped unless `HARDHAT_RPC_URL` is set).
- [ ] **Step 5: Commit.** `git add src/smart src/viem.ts src/hooks/useClient.ts src/entries/background/rpc.ts && git commit -m "feat(smart): node layer with anvil/hardhat translation"`

### Task 2: Account-abstraction contracts, paymaster, setup

**Files:**
- Create: `contracts/foundry.toml`, `contracts/src/DevWalletPaymaster.sol`, `scripts/generate-aa-code.ts`,
  `src/smart/constants.ts`, `src/smart/aa-code.generated.ts`, `src/smart/testing/kernel-arbitrum-sepolia.generated.ts`,
  `src/smart/setup.ts`
- Test: `src/smart/setup.test.ts`
- Modify: `package.json` (script `"aa:generate": "forge build --root contracts && bun scripts/generate-aa-code.ts"`),
  `.gitignore` (add `contracts/out`, `contracts/cache`, `.superpowers/`)

**Interfaces:**
- Consumes: `Node`, `connectNode` (Task 1).
- Produces:
  - `src/smart/constants.ts`: `ENTRY_POINT_07`, `SENDER_CREATOR_07`, `KERNEL_V3_3`, `DEVWALLET_SPONSOR`,
    `DEVWALLET_PAYMASTER`, `DELEGATION_PREFIX = '0xef0100'`, `KERNEL_EXECUTE_BATCH_MODE`, `ERC1271_MAGIC`. All values
    come from Global Constraints.
  - `src/smart/aa-code.generated.ts`:
    - `ENTRY_POINT_07_CODE`, `SENDER_CREATOR_07_CODE`, `KERNEL_V3_3_CODE` (mainnet build), `DEVWALLET_PAYMASTER_CODE`,
      all `Hex`
    - `KERNEL_IMMUTABLE_RANGES: readonly (readonly [start: number, end: number])[]` (byte offsets, end exclusive)
    - `AA_CODE_SOURCES: Record<string, { chain: string; blockNumber: string; address: Address }>`
  - `KERNEL_V3_3_ARBITRUM_SEPOLIA_CODE: Hex` (test fixture)
  - `src/smart/setup.ts`:
    - `type AaStatus = { ok: true; installed: Address[] } | { ok: false; conflicts: Address[] }`
    - `ensureAaContracts(node: Node): Promise<AaStatus>`
    - `isKnownKernelCode(code: Hex): boolean`

- [ ] **Step 1: Write `contracts/src/DevWalletPaymaster.sol`.** The ABI must match EntryPoint v0.7 exactly.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
struct PackedUserOperation { address sender; uint256 nonce; bytes initCode; bytes callData; bytes32 accountGasLimits; uint256 preVerificationGas; bytes32 gasFees; bytes paymasterAndData; bytes signature; }
/// Accept-all paymaster for local chains; its EntryPoint deposit is funded by DevWallet's sponsor.
contract DevWalletPaymaster {
    function validatePaymasterUserOp(PackedUserOperation calldata, bytes32, uint256) external pure returns (bytes memory context, uint256 validationData) { return ("", 0); }
    function postOp(uint8, bytes calldata, uint256, uint256) external {}
}
```

  `contracts/foundry.toml` sets `src = 'src'`, `out = 'out'`, `solc_version = "0.8.24"` and `evm_version = "cancun"`.

- [ ] **Step 2: Write `scripts/generate-aa-code.ts`.**
  - **Inputs:** `MAINNET_RPC_URL` (default `https://ethereum-rpc.publicnode.com`) and `ARBITRUM_SEPOLIA_RPC_URL`
    (default `https://arbitrum-sepolia-rpc.publicnode.com`).
  - It reads `eth_getCode` at `latest` for EntryPoint, SenderCreator and Kernel from mainnet, and Kernel from Arbitrum
    Sepolia. It records the block numbers in `AA_CODE_SOURCES`.
  - The paymaster code comes from `contracts/out/DevWalletPaymaster.sol/DevWalletPaymaster.json` `deployedBytecode.object`.
  - It writes both generated files.
  - **Immutable-range algorithm** (the signature doesn't determine this):
    - Walk the mainnet Kernel bytecode opcode by opcode. For opcodes `0x60`–`0x7f`, skip `op - 0x5f` operand bytes and
      record each PUSH operand's `[start, end)`.
    - Collect the byte offsets where the mainnet and Arbitrum Sepolia builds differ. The script fails if the lengths
      differ.
    - Emit every PUSH operand range that contains at least one differing offset, sorted and de-duplicated.
    - The script fails if any differing offset lies outside a PUSH operand.
  - Run `bun run aa:generate` and commit the generated files.
- [ ] **Step 3: Write the failing tests** in `src/smart/setup.test.ts`, each on a fresh Anvil.

```ts
test('installs all four contracts on a fresh chain', async () => {
  const status = await ensureAaContracts(node)
  expect(status).toEqual({ ok: true, installed: [ENTRY_POINT_07, SENDER_CREATOR_07, KERNEL_V3_3, DEVWALLET_PAYMASTER] })
  expect(await node.getCode(KERNEL_V3_3)).toBe(KERNEL_V3_3_CODE)
  expect(await node.getCode(DEVWALLET_PAYMASTER)).toBe(DEVWALLET_PAYMASTER_CODE)
})
test('second run installs nothing', async () => {
  await ensureAaContracts(node)
  expect(await ensureAaContracts(node)).toEqual({ ok: true, installed: [] })
})
test("accepts d1's Arbitrum Sepolia Kernel build untouched", async () => {
  await node.setCode(KERNEL_V3_3, KERNEL_V3_3_ARBITRUM_SEPOLIA_CODE)
  expect((await ensureAaContracts(node)).ok).toBe(true)
  expect(await node.getCode(KERNEL_V3_3)).toBe(KERNEL_V3_3_ARBITRUM_SEPOLIA_CODE)
})
test('refuses to overwrite unknown code', async () => {
  await node.setCode(KERNEL_V3_3, '0x6000')
  expect(await ensureAaContracts(node)).toEqual({ ok: false, conflicts: [KERNEL_V3_3] })
  expect(await node.getCode(KERNEL_V3_3)).toBe('0x6000')
})
test('isKnownKernelCode masks only immutables', () => {
  expect(isKnownKernelCode(KERNEL_V3_3_CODE)).toBe(true)
  expect(isKnownKernelCode(KERNEL_V3_3_ARBITRUM_SEPOLIA_CODE)).toBe(true)
  const flipAt = KERNEL_IMMUTABLE_RANGES[0][0] - 1
  const bytes = hexToBytes(KERNEL_V3_3_CODE); bytes[flipAt] ^= 0xff
  expect(isKnownKernelCode(bytesToHex(bytes))).toBe(false)
})
```

- [ ] **Step 4: Run them to see them fail.** Run `bun test src/smart/setup.test.ts`. Expected: FAIL.
- [ ] **Step 5: Implement `ensureAaContracts` and `isKnownKernelCode`.**
  - EntryPoint, SenderCreator and the paymaster are recognized only on exact equality. Kernel is recognized by
    `isKnownKernelCode`: same length, and equal outside `KERNEL_IMMUTABLE_RANGES`.
  - Empty code gets installed. Unrecognized code is listed in `conflicts`, and nothing is written when there is any
    conflict.
- [ ] **Step 6: Run the tests to see them pass.** Run `bun test src/smart/setup.test.ts`. Expected: PASS.
- [ ] **Step 7: Commit.** `git commit -m "feat(smart): bundle EntryPoint/Kernel/paymaster and install on demand"` (add `contracts/`, `scripts/`, `src/smart/`, `package.json`, `.gitignore`)

### Task 3: Kernel helpers and account classification

**Files:**
- Create: `src/smart/kernel.ts`
- Test: `src/smart/kernel.test.ts`

**Interfaces:**
- Consumes: `Node`, constants, `ensureAaContracts`.
- Produces:
  - `encodeKernelBatch(calls: readonly Call[]): Hex`
  - `decodeKernelBatch(data: Hex): Call[] | null` (null when it isn't a batch `execute`)
  - `delegationCode(target: Address): Hex`
  - `classifyCode(code: Hex): OnchainKind`
  - `setDelegation(node: Node, address: Address, target: Address | null): Promise<void>`

- [ ] **Step 1: Write the failing tests.**
  - **Pure:**
    - `encodeKernelBatch` starts with `0xe9ae5c53`, and its first argument equals `KERNEL_EXECUTE_BATCH_MODE`.
    - `decodeKernelBatch(encodeKernelBatch(calls))` deep-equals `calls`, with missing `value` normalized to `0n` and
      `data` to `'0x'`.
    - `classifyCode('0x')` gives `{kind:'eoa'}`.
    - `classifyCode(delegationCode(KERNEL_V3_3).toUpperCase())` gives `{kind:'kernel'}`.
    - `classifyCode(delegationCode('0x1111111111111111111111111111111111111111'))` gives
      `{kind:'delegated', target:'0x1111111111111111111111111111111111111111'}`.
    - `classifyCode('0x6080')` gives `{kind:'contract'}`.
  - **Anvil**, after `ensureAaContracts`. The account is `DEV_ACCOUNTS[1]`, delegated with `setDelegation`:
    - `'self-call batch is atomic and applies all calls'`: the account sends `eth_sendTransaction({ from: account, to:
      account, data: encodeKernelBatch([{to: A, value: 1n}, {to: B, value: 2n}]) })`. A's balance rises by exactly `1n`
      and B's by exactly `2n`, and the receipt status is `success`.
    - `'a failing call reverts the whole batch'`: put `0x5f5ffd` (always reverts) at address R with `setCode`, then
      send `[{to: A, value: 1n}, {to: R}]`. The receipt status is `reverted`, and A's balance is unchanged.
    - `'impersonated EOAs can self-call'`: `setBalance` an arbitrary address `I`, impersonate it, delegate it, and send
      the batch from `I`. It succeeds.
    - `'Kernel ERC-1271 accepts d1-style wrapped signatures'`:
      - Sign with `eth_signTypedData_v4` from the account, using domain `{name:'Kernel', version:'0.3.3', chainId:31337,
        verifyingContract: account}` and types `{Kernel:[{name:'hash',type:'bytes32'}]}`.
      - `isValidSignature(hash, concat(['0x00', sig]))` returns `ERC1271_MAGIC`.
      - The same call with the raw `sig` does not return `ERC1271_MAGIC`. It may revert.
    - `setDelegation(node, account, null)` leaves code `'0x'`.
- [ ] **Step 2: Run them to see them fail.** Run `bun test src/smart/kernel.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** with viem's `encodeFunctionData` / `encodeAbiParameters`. `classifyCode` lowercases the code
  before comparing. A 23-byte `0xef0100…` code is delegated, and anything else that's non-empty is a contract.
- [ ] **Step 4: Run the tests to see them pass.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(smart): kernel batch encoding, delegation, classification"`

### Task 4: Account modes, reconcile, account-list fixes

**Files:**
- Create: `src/smart/modes.ts`, `src/zustand/account-modes.ts`, `src/utils/accounts.ts`
- Test: `src/smart/modes.test.ts`, `src/utils/accounts.test.ts`
- Modify:
  - `src/zustand/account.ts`: `getAccounts` uses `filterAccounts`
  - `src/zustand/index.ts`: export the new store
  - `src/app.tsx` (`AccountsChangedEmitter`): emit only when `sameAddresses` is false

**Interfaces:**
- Consumes: `classifyCode`, `setDelegation`, `ensureAaContracts`, `AaStatus`.
- Produces:
  - `defaultMode(args: { impersonated: boolean; onchain: OnchainKind }): AccountMode`
  - `atomicStatus(mode: AccountMode, onchain: OnchainKind): AtomicStatus`
  - `type ReconcileResult = { address: Address; mode: AccountMode; onchain: OnchainKind; changed: boolean }`
  - `reconcileAccount(node: Node, a: { address: Address; mode: AccountMode }): Promise<ReconcileResult>`
  - `reconcileAccounts(node: Node, accounts: { address: Address; mode: AccountMode }[]): Promise<{ aa: AaStatus; accounts: ReconcileResult[] }>`
  - `accountModesStore`: persisted as `'account-modes'`, holding `modes: Record<string, AccountMode>`, with actions
    `getMode({ rpcUrl, address }): AccountMode | undefined`, `setMode({ rpcUrl, address, mode })` and
    `clearMode({ rpcUrl, address })`
  - `modeKey(rpcUrl: string, address: Address): string`, which returns `` `${rpcUrl}.${address.toLowerCase()}` ``
  - `filterAccounts<T extends { address: Address; rpcUrl?: string }>(args: { account?: T; accounts: readonly T[]; activeFirst?: boolean; rpcUrl?: string }): T[]`
  - `sameAddresses(a: readonly { address: Address }[], b: readonly { address: Address }[]): boolean`

- [ ] **Step 1: Write the failing tests.**
  - **`defaultMode`:**
    - not impersonated, any on-chain kind → `'smart'`
    - impersonated with `{kind:'kernel'}` → `'smart'`
    - impersonated with `eoa`, `delegated` or `contract` → `'plain-never'`
  - **`atomicStatus`:**
    - (`smart`, `kernel`) → `supported`
    - (`smart`, `eoa`) → `unsupported`. Capabilities are always computed after reconcile, and a smart account that is
      still an EOA at that point couldn't be delegated (for example because of a Kernel conflict).
    - (`smart`, `delegated`) → `unsupported`
    - (any mode, `contract`) → `unsupported`
    - (`plain-upgradable`, `eoa`) → `ready`
    - (`plain-never`, any) → `unsupported`
    - (`plain-upgradable`, `kernel`) → `supported`, because it's already delegated
  - **`reconcileAccount`** (Anvil, with contracts installed):
    - `smart` on an EOA → the code becomes the delegation, and `changed: true`
    - `plain-never` on a Kernel-delegated account → the code becomes `'0x'`, and `changed: true`
    - `smart` on an account delegated to `0x1111…` → untouched, `changed: false`, and `onchain.kind === 'delegated'`
    - `smart` on a contract → untouched
  - **`reconcileAccounts`** when the Kernel slot holds `0x6000` → `aa.ok === false`, and no account gets delegated.
  - **`filterAccounts`:** given accounts on `rpcA` and `rpcB`, with active account `a1` on `rpcA` and
    `activeFirst: true, rpcUrl: rpcA`, it returns only `rpcA` accounts, with `a1` first. This is the `eth_accounts` leak
    fix.
  - **`sameAddresses`:** the same addresses with different `displayName` → `true`, and a different order → `false`.
- [ ] **Step 2: Run them to see them fail.** Run `bun test src/smart/modes.test.ts src/utils/accounts.test.ts`.
  Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `reconcileAccounts` calls `ensureAaContracts` first. If that returns not-ok, it only classifies the accounts.
  - Otherwise each account is reconciled in parallel:
    - `smart` and `eoa` → delegate it
    - `plain-*` and `kernel` → clear it
    - everything else is left alone
  - Update `account.ts` and `app.tsx` to use the helpers.
- [ ] **Step 4: Run the tests to see them pass.** Expected: PASS. Then run `bun run typecheck`.
- [ ] **Step 5: Commit.** `git commit -m "feat(smart): account modes and reconcile; fix eth_accounts leak"`

### Task 5: Sponsor and user operations

**Files:**
- Create: `src/smart/sponsor.ts`, `src/smart/userop.ts`
- Test: `src/smart/userop.test.ts`

**Interfaces:**
- Consumes: `Node`, constants, `encodeKernelBatch`, `ensureAaContracts`, `setDelegation`.
- Produces:
  - Thresholds:
    - `SPONSOR_MIN_BALANCE = parseEther('10')`
    - `SPONSOR_TOP_UP = parseEther('1000')`
    - `PAYMASTER_MIN_DEPOSIT = parseEther('1')`
    - `PAYMASTER_TOP_UP = parseEther('10')`
  - `type SponsorPlan = { ok: true; sender: Address } | { ok: false; reason: string }`
  - `prepareSponsor(node: Node, setting: SponsorSetting): Promise<SponsorPlan>`
  - `buildUserOp(node: Node, args: { sender: Address; calls: readonly Call[] }): Promise<UserOperation<'0.7'>>`, using
    viem's `UserOperation` type
  - `signUserOp(node: Node, op: UserOperation<'0.7'>, chainId: number): Promise<{ signature: Hex; userOpHash: Hex }>`
  - `submitUserOp(node: Node, args: { op: UserOperation<'0.7'>; bundler: Address }): Promise<Hash>` (the `handleOps`
    transaction hash)
  - `type UserOpOutcome = { success: boolean; actualGasCost: bigint; paymaster: Address }`
  - `getUserOpOutcome(node: Node, transactionHash: Hash, userOpHash: Hex): Promise<UserOpOutcome | null>` (null while
    the transaction is unmined)

- [ ] **Step 1: Write the failing tests.** Anvil, contracts installed, `DEV_ACCOUNTS[1]` delegated, recipient `X` fresh.
  - `prepareSponsor(node, {kind:'devwallet'})`:
    - returns `{ok:true, sender: DEVWALLET_SPONSOR}`
    - the sponsor's balance is ≥ `SPONSOR_MIN_BALANCE`
    - EntryPoint `balanceOf(DEVWALLET_PAYMASTER)` is ≥ `PAYMASTER_MIN_DEPOSIT`
  - `prepareSponsor(node, {kind:'off'})` returns `{ok:false, reason:'Sponsorship is off.'}`.
  - `prepareSponsor(node, {kind:'account', address: <fresh zero-balance address>})` returns `ok:false`, with a reason
    matching `/too little ETH/`.
  - `'sponsored op moves value, not gas, from the account'`:
    - Build, sign and submit `[{to: X, value: parseEther('1')}]`, with the sponsor as bundler.
    - X gains exactly 1 ETH, and the account's balance drops by exactly 1 ETH.
    - The transaction's `to` is `ENTRY_POINT_07` and its `from` is `DEVWALLET_SPONSOR`.
    - The outcome is `{success:true, paymaster: DEVWALLET_PAYMASTER}`, with `actualGasCost > 0n`.
  - `'signature recovers to sender'`: `recoverMessageAddress({ message: { raw: userOpHash }, signature })` equals the
    account.
  - `'reverting op: outer tx succeeds, outcome says failure'` (this pins the gap spec §4 documents): a call to the
    `0x5f5ffd` address gives an outer receipt `success` and an outcome with `success: false`.
- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`prepareSponsor`:**
    - Any node error while funding (for example a refused `setBalance`) returns
      `{ok:false, reason: `Couldn't fund the sponsor: ${message}`}` and is never thrown. Add a test with a node wrapper
      whose `setBalance` throws.
    - `devwallet`: impersonate the sponsor. If its balance is below the minimum, `setBalance` it to `SPONSOR_TOP_UP`.
    - `account`: impersonate the account only if it isn't one of the node's `eth_accounts`. It needs at least
      `PAYMASTER_TOP_UP + parseEther('0.1')` when the deposit needs a top-up, otherwise ≥ `parseEther('0.1')`. If it
      falls short, the reason is `` `Sponsor ${address} has too little ETH.` ``.
    - Then, if the paymaster's EntryPoint deposit is below `PAYMASTER_MIN_DEPOSIT`, the sponsor sends
      `depositTo(DEVWALLET_PAYMASTER)` with value `PAYMASTER_TOP_UP`.
  - **`buildUserOp`:**
    - `nonce` comes from EntryPoint `getNonce(sender, 0)`.
    - `callData` is `encodeKernelBatch(calls)`.
    - `callGasLimit` is `eth_estimateGas({from: sender, to: sender, data: callData}) * 12n / 10n + 50_000n`.
    - Fixed values: `verificationGasLimit: 500_000n`, `preVerificationGas: 60_000n`, `paymaster: DEVWALLET_PAYMASTER`,
      `paymasterVerificationGasLimit: 100_000n`, `paymasterPostOpGasLimit: 0n`, `paymasterData: '0x'`.
    - `maxPriorityFeePerGas` comes from `eth_maxPriorityFeePerGas`, falling back to `1 gwei`.
      `maxFeePerGas = latest.baseFeePerGas * 2n + maxPriorityFeePerGas`.
  - **`signUserOp`:** `getUserOperationHash({ userOperation, entryPointAddress: ENTRY_POINT_07, entryPointVersion:
    '0.7', chainId })`, then `eth_sign(sender, hash)`.
  - **`submitUserOp`:** `eth_sendTransaction` from the bundler to EntryPoint
    `handleOps([toPackedUserOperation(op)], bundler)`, using `entryPoint07Abi` from `viem/account-abstraction`.
  - **`getUserOpOutcome`:** decode `UserOperationEvent` from the receipt, matching on `userOpHash`.
- [ ] **Step 4: Run the tests to see them pass.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(smart): sponsor funding and handleOps user operations"`

### Task 6: Simulation

**Files:**
- Create: `src/smart/simulate.ts`
- Test: `src/smart/simulate.test.ts` (deploys `MockERC20` from `test/contracts/generated.ts`)

**Interfaces:**
- Consumes: `Node`, `encodeKernelBatch`.
- Produces:
  - `type BalanceChange = { token: Address | 'native'; delta: bigint }`
  - `type SimulationResult = { ok: true; gasUsed: bigint | null; balanceChanges: BalanceChange[] | null } | { ok: false; failedIndex: number | null; revertData: Hex | null; message: string }`
    (`gasUsed` is the sum of the calls' `gasUsed` from `eth_simulateV1`, or `null` in the fallback)
  - `simulateCalls(node: Node, args: { from: Address; atomic: boolean; calls: readonly Call[] }): Promise<SimulationResult>`

- [ ] **Step 1: Write the failing tests.** The account is a delegated `DEV_ACCOUNTS[1]` holding 100 MockERC20.
  - **Success:**
    - Simulate `[{to: X, value: parseEther('1')}, transfer(Y, 5)]` with `atomic: true`. The result is `ok`.
    - `balanceChanges` contains `{token:'native', delta: -parseEther('1')}` and `{token: <token>, delta: -5n}`.
    - `gasUsed > 0n`.
    - Nothing was mined: X's balance is unchanged.
  - **Failure:** `[{to: X, value: 1n}, {to: R /* 0x5f5ffd */}]` gives `ok: false` and `failedIndex: 1`.
  - **Custom revert data:** `transfer(Y, 1000)` (insufficient balance) gives `ok: false`, with `revertData` non-null and
    `message` non-empty.
  - **`eth_simulateV1` unsupported:** wrap the node so that `request('eth_simulateV1')` throws `WalletRpcError(-32601)`.
    - On success the result is `ok`, with `balanceChanges: null` and `gasUsed: null`.
    - On failure the result is `ok: false`, with `failedIndex: null` and `revertData` non-null.
  - **`atomic: false`:** each call is simulated alone, so `[transfer(Y, 5), transfer(Y, 5)]` with a balance of 7 is
    `ok`. Sequential state isn't carried; this test pins that.
- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Primary path:** `eth_simulateV1` with `traceTransfers: true` and `validation: false`. Use one block in which
    every call is its own call from `from`, so state carries between calls; for `atomic: false`, use one block per call.
  - `failedIndex` is the first call whose status is `0x0`.
  - `balanceChanges` comes from ERC-20 `Transfer` logs touching `from`, plus native transfer logs (emitted from
    `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`).
  - **Fallback when that method is unsupported** (memoize the "unsupported" answer per `node.rpcUrl`): for atomic
    simulation, `eth_call` with `{from, to: from, data: encodeKernelBatch(calls)}`; otherwise `eth_call` each call.
- [ ] **Step 4: Run the tests to see them pass.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(smart): batch simulation with balance changes"`

### Task 7: Execution layer

**Files:**
- Create: `src/smart/execute.ts`
- Test: `src/smart/execute.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces:
  - `type ExecutionPath = 'userop' | 'self-call' | 'sequential' | 'deploy'`
  - `type ExecuteInput = { node: Node; chainId: number; account: { address: Address; mode: AccountMode; onchain: OnchainKind; canSign: boolean }; calls: readonly Call[]; atomicRequired: boolean; sponsor: SponsorSetting; force?: boolean }`
  - `type ExecutionPlan = { path: ExecutionPath; payer: Address; sponsored: boolean; fallbackReason?: string; simulation: SimulationResult }`
  - `type ExecutionResult = ExecutionPlan & { transactionHashes: Hash[]; userOpHash?: Hex }`
  - `planExecution(input: ExecuteInput): Promise<ExecutionPlan>`, which throws `WalletRpcError`
  - `executeCalls(input: ExecuteInput): Promise<ExecutionResult>`

- [ ] **Step 1: Write the failing tests.** These are the rules from spec §4, checked in order. Each is one test on
  Anvil.
  1. Any call without `to`:
     - a single call gives path `deploy`, and the receipt has a `contractAddress` (deploy `MockERC20`)
     - more than one call throws code `-32602`
  2. `atomicStatus(mode, onchain) !== 'supported'`:
     - `atomicRequired: true` throws `5760`
     - otherwise the path is `sequential`, each call is sent as its own `eth_sendTransaction` from the account, and the
       payer is the account
  3. Simulation fails and `force` is not set: throws code `3`, with `data` equal to `simulation.revertData`.
     **Nothing is mined:** the block number is unchanged.
  4. Simulation fails and `force` is set: path `self-call`. The receipt status is `reverted`, and A's balance is
     unchanged.
  5. `canSign` with sponsor `devwallet`: path `userop`, payer `DEVWALLET_SPONSOR`, `sponsored: true`. The account's ETH
     changes only by value.
  6. `canSign: false` (impersonated) with sponsor `devwallet`: path `self-call`, payer the account, `sponsored: false`,
     with `fallbackReason` equal to `"Impersonated accounts can't sign, so they pay their own gas."`.
  7. Sponsor `off`: path `self-call`, `sponsored: false`, and `fallbackReason` undefined.
  8. Sponsor `{kind:'account'}` with too little ETH: path `self-call`, `sponsored: false`, and `fallbackReason` set to
     the plan's reason. **This is Review Focus #4.**
  - `planExecution` performs the same checks without sending anything, so the block number is unchanged.
- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `planExecution` decides the path; `executeCalls` performs it.
  - Before any self-call or sequential send from an account the node doesn't list in `eth_accounts`, call
    `node.impersonate(address)`.
  - `transactionHashes` holds one hash for `userop`, `self-call` and `deploy`, and one per call for `sequential`.
- [ ] **Step 4: Run the tests to see them pass.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(smart): execution layer (userop / self-call / sequential / deploy)"`

### Task 8: EIP-5792 core, batch records, viem compatibility

**Files:**
- Create: `src/smart/eip5792.ts`, `src/smart/wallet-core.ts`, `src/smart/testing/wallet.ts`
- Test: `src/smart/eip5792.test.ts`, `src/smart/viem-compat.test.ts`
- Modify: `src/zustand/batch-calls.ts`. Rewrite it as `records: Record<rpcUrl, Record<id, BatchRecord>>`, with pure
  helpers `putRecord`, `pruneRecords(state, rpcUrl, keep = 200)`, `clearRecords(state, rpcUrl)` and
  `recordsForTransaction(state, rpcUrl, hash): BatchRecord[]`. Bump the persist `version` to `1` and drop old data.

**Interfaces:**
- Consumes: `executeCalls`, `ExecutionResult`, `atomicStatus`, `getUserOpOutcome`.
- Produces:
  - `type BatchRecord = { id: string; rpcUrl: string; chainId: number; from: Address; calls: RpcCall[]; path: ExecutionPath; transactionHashes: Hash[]; userOpHash?: Hex; createdAt: number }`
  - `interface BatchRecords { get(id: string): BatchRecord | undefined; put(r: BatchRecord): void }`
  - `getCapabilities(args: { chainId: number; status: AtomicStatus; requestedChainIds?: Hex[] }): Record<Hex, { atomic: { status: AtomicStatus } }>`
  - `type ParsedSendCalls = { id: string; from: Address; calls: Call[]; atomicRequired: boolean }`
  - `parseSendCalls(params: unknown, ctx: { chainId: number; activeAccount: Address; knownAccounts: readonly Address[]; records: BatchRecords }): ParsedSendCalls`
  - `type CallsStatus = { version: '2.0.0'; id: string; chainId: Hex; status: 100 | 200 | 400 | 500 | 600; atomic: boolean; receipts?: { logs: { address: Address; data: Hex; topics: Hex[] }[]; status: '0x1' | '0x0'; blockHash: Hex; blockNumber: Hex; gasUsed: Hex; transactionHash: Hash }[] }`
  - `getCallsStatus(node: Node, record: BatchRecord): Promise<CallsStatus>`
  - `type WalletCoreDeps = { node: Node; rpcUrl: string; chainId: number; activeAccount: Address; accounts: readonly { address: Address; mode: AccountMode; onchain: OnchainKind; canSign: boolean }[]; sponsor: SponsorSetting; records: BatchRecords; force?: boolean }`
  - `handleWalletRequest(deps: WalletCoreDeps, request: { method: string; params?: unknown[] }): Promise<unknown>`. It
    handles `wallet_getCapabilities`, `wallet_sendCalls` and `wallet_getCallsStatus`, and throws
    `WalletRpcError(4200)` for anything else.
  - `createTestWallet(deps: Omit<WalletCoreDeps, 'records'>): EIP1193Provider`. Wallet methods route to
    `handleWalletRequest` with an in-memory `BatchRecords`. `eth_accounts` and `eth_chainId` are answered from `deps`.
    Everything else goes to the node.

- [ ] **Step 1: Write the failing tests** in `eip5792.test.ts`.
  - **`getCapabilities`:**
    - `({chainId: 31337, status: 'supported'})` deep-equals `{'0x7a69': {atomic: {status: 'supported'}}}`
    - with `requestedChainIds: ['0x1']` → `{}`
  - **`parseSendCalls`:**
    - a missing or other `version` → `-32602`
    - `chainId: '0x1'` → `5710`
    - a duplicate `id` already in the records → `5720`
    - unknown top-level capability `{foo: {}}` → `5700`, while `{foo: {optional: true}}` is accepted
    - an unknown call-level non-optional capability → `5700`
    - a `from` not in `knownAccounts` → `4100` (**Review Focus #3**)
    - a missing `from` → `activeAccount`
    - a missing `id` → a generated `0x`-prefixed 32-byte hex string
    - `atomicRequired` is passed through
  - **`getCallsStatus`** (Anvil):
    - a `userop` record → `200`, with one receipt of status `0x1` and `atomic: true`
    - a reverted self-call → `500`, with receipt status `0x0`
    - a `sequential` record with one ok and one reverted call → `600`, with `atomic: false`
    - **Review Focus #2:** with `evm_setAutomine(false)`, a fresh record → `100`; after `evm_mine` → `200`
  - **`handleWalletRequest('wallet_getCallsStatus', ['0xunknown'])`** → `5730`.
- [ ] **Step 2: Write the failing compatibility test** in `viem-compat.test.ts`. It builds a viem `createWalletClient({
  transport: custom(createTestWallet(...)) })` with `DEV_ACCOUNTS[1]` in mode `smart` (reconciled first) and sponsor
  `devwallet`.

```ts
expect((await getCapabilities(client, { account, chainId: 31337 })).atomic?.status).toBe('supported')
const { id } = await sendCalls(client, { account, forceAtomic: true, calls: [{ to: X, value: 1n }, { to: Y, value: 2n }] })
const res = await waitForCallsStatus(client, { id })
expect(res.status).toBe('success'); expect(res.atomic).toBe(true); expect(res.receipts).toHaveLength(1)
const err = await sendCalls(client, { account, forceAtomic: true, calls: [{ to: R }] }).catch((e) => e)
expect(err.walk((e: any) => e?.code === 3)).toBeTruthy()
```

- [ ] **Step 3: Run them to see them fail.** Run `bun test src/smart/eip5792.test.ts src/smart/viem-compat.test.ts`.
  Expected: FAIL.
- [ ] **Step 4: Implement.**
  - **Status mapping:**
    - `userop`: no receipt → `100`. Otherwise the outcome's success → `200`, failure → `500`. The receipt's `status` is
      overridden with the outcome.
    - `self-call` and `deploy`: no receipt → `100`, then the receipt status maps to `200`/`500`.
    - `sequential`: any receipt missing → `100`, all ok → `200`, all failed → `500`, mixed → `600`.
  - Receipt fields are hex. `atomic` is `path !== 'sequential'`.
- [ ] **Step 5: Run the tests to see them pass.** Expected: PASS.
- [ ] **Step 6: Commit.** `git commit -m "feat(smart): EIP-5792 v2 core with viem compatibility tests"`

### Task 9: Error fidelity, approval-method list, permissions

**Files:**
- Create: `src/entries/background/methods.ts`
- Test: `src/entries/background/methods.test.ts`, `src/errors/toProviderError.test.ts`
- Modify:
  - `src/entries/background/rpc.ts`:
    - use `requiresApproval`
    - serialize every thrown error with `serializeError`
    - remove the `success === false` branch
    - add `wallet_requestPermissions` and `wallet_getPermissions`
  - `src/entries/background/wallet-sidebar.ts`: use `opensSidebar`
  - `src/provider.ts`: use `toProviderError`
  - `src/errors/rpc.ts`: widen `ProviderRpcErrorCode` to `number`, and export
    `toProviderError(error: { code: number; message: string; data?: unknown }): Error`

**Interfaces:**
- Produces:
  - `SIGNATURE_METHODS = ['eth_sign', 'personal_sign', 'eth_signTypedData_v4'] as const`
  - `TRANSACTION_METHODS = ['eth_sendTransaction', 'wallet_sendCalls'] as const`
  - `requiresApproval(method: string, s: { bypassSignatureAuth?: boolean; bypassTransactionAuth?: boolean }): boolean`
  - `opensSidebar(method: string, s: same): boolean`. This is `requiresApproval`, plus `eth_requestAccounts`,
    `wallet_requestPermissions` and `wallet_showCallsStatus`.
  - `permissionsFor(origin: string, connected: boolean): { invoker: string; parentCapability: 'eth_accounts'; caveats: [] }[]`

- [ ] **Step 1: Write the failing tests.**
  - `requiresApproval('eth_sendTransaction', {})` is true, and false with `{bypassTransactionAuth: true}`.
  - `requiresApproval('eth_sign', {bypassSignatureAuth: true})` is false.
  - `requiresApproval('eth_call', {})` is false.
  - `opensSidebar('wallet_requestPermissions', {})` is true.
  - `toProviderError`:
    - `({code: 3, message: 'execution reverted', data: '0x08c379a0'})` keeps `.code === 3` and `.data === '0x08c379a0'`
    - `({code: 5730, message: 'x'})` keeps `.code === 5730`
    - `({code: 4001, message: 'x'})` is a `UserRejectedRequestError`
  - `serializeError(new WalletRpcError(5760, 'no'))` is `{code: 5760, message: 'no'}`, and `serializeError(new
    Error('boom'))` is `{code: -32603, message: 'boom'}`.
  - `permissionsFor('https://a', true)` has length 1, with `parentCapability: 'eth_accounts'`.
    `permissionsFor('https://a', false)` is empty.
- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement**, and wire `rpc.ts`, `wallet-sidebar.ts` and `provider.ts` onto it.
  - `wallet_requestPermissions` with `[{eth_accounts: {}}]` runs exactly the `eth_requestAccounts` path, including
    `bypassConnectAuth`, and returns `permissionsFor(origin, true)`.
  - `wallet_getPermissions` returns `permissionsFor(origin, !!session)`.
  - The background reply always carries `error: serializeError(e)`, never a string.
- [ ] **Step 4: Run the tests to see them pass.** Then run `bun run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "fix: keep error codes and revert data; add wallet_requestPermissions"`

### Task 10: Background wiring for smart accounts

**Files:**
- Create: `src/entries/background/smart.ts`, `src/smart/preview.ts`
- Test: `src/entries/background/smart.test.ts` (only the pure helpers), `src/smart/preview.test.ts`
- Modify:
  - `src/entries/background/rpc.ts`: route through the glue, and delete `handleSendCalls` with its automine toggling
  - `src/entries/background/pending-requests.ts`: `Decision` gains `force?: boolean` on approved
  - `src/messengers/schema.ts`:
    - `pendingRequest` payload `{ request; status: 'approved' | 'rejected' | 'batched'; force?: boolean }`
    - new `previewSend: [payload: { rpcUrl: string; from: Address; calls: RpcCall[]; atomicRequired: boolean }, response: SendPreview]`
    - new `setAccountMode: [payload: { rpcUrl: string; address: Address; action: AccountMode | 'switch-to-kernel' | 'revoke' }, response: ReconcileResult]`
      (it has no bigints, so it is sent as-is)
    - new `smartStatus: [payload: { rpcUrl: string }, response: AaStatus]`
    - new `notice: [payload: { message: string }, response: void]`
  - `src/zustand/settings.ts`: add `sponsor: SponsorSetting`, default `{ kind: 'devwallet' }`, and `setSponsor`. Bump
    the version to `2` with a migrate that adds the default.

**Interfaces:**
- Consumes: `handleWalletRequest`, `planExecution`, `executeCalls`, `reconcileAccounts`, `defaultMode`,
  `accountModesStore`, `batchCallsStore` helpers.
- Produces:
  - From `src/smart/preview.ts`, which is shared by the background and the UI:
    - `type SendPreview = { mode: AccountMode; onchain: OnchainKind; atomicStatus: AtomicStatus; path: ExecutionPath | null; payer: Address | null; sponsored: boolean; fallbackReason?: string; estimatedCostWei: string | null; simulation: SerializedSimulation; error?: { code: number; message: string; data?: unknown } }`
    - `type SerializedSimulation`, which is `SimulationResult` with every bigint as a decimal string
    - `toSendPreview(args: { mode: AccountMode; onchain: OnchainKind; plan?: ExecutionPlan; error?: unknown; maxFeePerGas: bigint }): SendPreview`.
      `estimatedCostWei` is `simulation.gasUsed * maxFeePerGas`, or `null` when `gasUsed` is null.
    - Test (`src/smart/preview.test.ts`): a plan with `gasUsed: 21000n` and `maxFeePerGas: 2n` gives
      `estimatedCostWei: '42000'`. A thrown `WalletRpcError(3, 'reverted', '0xdead')` gives `path: null` and
      `error: {code: 3, message: 'reverted', data: '0xdead'}`. The result survives `JSON.parse(JSON.stringify(x))`
      unchanged.
  - From `src/entries/background/smart.ts`:
    - `detectReset(prev: bigint | undefined, current: bigint): boolean`, true when `current < prev`
    - `resolveAccount(args: { address: Address; impersonated: boolean; stored?: AccountMode; onchain: OnchainKind }): { mode: AccountMode; canSign: boolean }`
    - `reconcileForRpc(rpcUrl: string): Promise<WalletCoreDeps>`. It is memoized for 1000 ms per rpcUrl and recomputed
      at once after a send.

- [ ] **Step 1: Write the failing tests.**
  - `detectReset(undefined, 5n)` is false, `detectReset(10n, 3n)` is true, and `detectReset(3n, 3n)` is false.
  - `resolveAccount`:
    - a stored mode wins
    - otherwise the result is `defaultMode`
    - `canSign` is `!impersonated`
  - **Review Focus #1 (Anvil, through the same functions `reconcileForRpc` composes):**
    - Reconcile `DEV_ACCOUNTS[1]` as smart, then `anvil_reset`, then reconcile again.
    - The Kernel code and the account's delegation are back.
    - `detectReset` on the before and after block numbers returns true.
- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement the wiring in `rpc.ts`.**
  - **`reconcileForRpc`:**
    - It reads accounts (`filterAccounts`), stored modes, `settingsStore.sponsor` and `node.blockNumber()`.
    - On a reset it calls `clearRecords` for that rpcUrl.
    - It runs `reconcileAccounts` and returns the deps.
  - **`eth_requestAccounts`, `eth_accounts` and `wallet_getCapabilities`** call `reconcileForRpc` before answering, so
    on-chain state matches the claimed mode before a dApp reads code.
  - **`wallet_getCapabilities`, `wallet_getCallsStatus` and `wallet_showCallsStatus`** go through `handleWalletRequest`
    or the records. An unknown id gives `5730`.
  - **`wallet_sendCalls` and `eth_sendTransaction` from an account whose mode is `smart`:**
    - These are approval-gated (Task 9).
    - After approval, `handleWalletRequest` / `executeCalls` runs with `force` taken from the decision.
    - `eth_sendTransaction` returns `transactionHashes[0]`.
    - From plain accounts, `eth_sendTransaction` is passed through as today.
  - **`plain-upgradable` meeting a `wallet_sendCalls`:**
    - On approval, call `setDelegation(KERNEL_V3_3)` and `setMode('smart')`, then execute.
    - On rejection, return `5750` instead of `4001`.
    - With `bypassTransactionAuth`, upgrade silently and send `notice` with
      `` `Upgraded ${address} to a Kernel smart account.` ``.
  - **`smartStatus`:** returns the last `reconcileAccounts` result's `aa` for that rpcUrl.
  - **`previewSend`:**
    - `planExecution` builds the preview, through `toSendPreview`.
    - A thrown `WalletRpcError` becomes `error` (with `path: null`), and the preview still resolves.
    - For `plain-upgradable` with status `ready`, preview as if smart.
  - **`setAccountMode`:**
    - `AccountMode` → `setMode` + reconcile
    - `'switch-to-kernel'` → `setDelegation(KERNEL_V3_3)` + `setMode('smart')`
    - `'revoke'` → `setMode('plain-upgradable')` + `setDelegation(null)`
- [ ] **Step 4: Run the tests to see them pass.** Run `bun test src/` and `bun run typecheck`. Expected: PASS.
- [ ] **Step 5: Manual check.**
  - Run `bun run dev` with `anvil` running, and open the playground at `http://localhost:5199`.
  - `wallet_getCapabilities` shows `"0x7a69": {atomic: {status: "supported"}}`.
  - A two-call `wallet_sendCalls` (playground, after Task 15, or the console) yields one transaction to EntryPoint, and
    `wallet_getCallsStatus` → `200`.
- [ ] **Step 6: Commit.** `git commit -m "feat(background): route sends through smart-account execution"`

### Task 11: Batch queue

**Files:**
- Create: `src/zustand/batch-queue.ts`, `src/smart/queue.ts`
- Test: `src/smart/queue.test.ts`
- Modify:
  - `src/entries/background/pending-requests.ts`: `'batched'` decisions skip the 5-minute expiry, and the waiter is
    parked in `queuedWaiters: Map<number, (r: RpcResponse) => void>`
  - `src/entries/background/rpc.ts`: when a queue is open for this rpcUrl and account, sends join it instead of
    executing, silently if bypass is on
  - `src/messengers/schema.ts`: `batchQueue: [payload: { action: 'sign'; force?: boolean } | { action: 'discard' }, response: { ok: true } | { ok: false; error: { code: number; message: string; data?: unknown } }]`
  - `src/entries/background/index.ts`: subscribe to queue changes and network changes
  - `src/zustand/index.ts`

**Interfaces:**
- Produces:
  - `type QueuedItem = { requestId: number; origin: string; method: 'eth_sendTransaction' | 'wallet_sendCalls'; calls: RpcCall[]; bundleId?: string; addedAt: number }`. `origin` is the site's host, or `'DevWallet'`.
  - `batchQueueStore`, persisted as `'batch-queue'`, holding `queue: { rpcUrl: string; account: Address; items: QueuedItem[]; openedAt: number } | null`.
    Actions: `openQueue({ rpcUrl, account })`, `enqueue(item)`, `moveItem(from: number, to: number)`,
    `removeItem(requestId)`, `clearQueue()`.
  - From `src/smart/queue.ts`:
    - `flattenQueue(items: readonly QueuedItem[]): RpcCall[]`
    - `waitingSites(items: readonly QueuedItem[]): number` (distinct origins other than `'DevWallet'`)
    - `resolutions(items: readonly QueuedItem[], result: { transactionHash: Hash; recordIds: Record<number, string> }): Map<number, unknown>`.
      `eth_sendTransaction` resolves to the hash, and `wallet_sendCalls` to `{ id: recordIds[requestId] }`.
    - `orphaned(items: readonly QueuedItem[], liveRequestIds: ReadonlySet<number>): number[]`
    - `droppedItems(prev: readonly QueuedItem[], next: readonly QueuedItem[]): number[]` (requestIds removed by the user)

- [ ] **Step 1: Write the failing tests** (pure).
  - `flattenQueue` keeps the order and keeps each `wallet_sendCalls` group's calls together.
  - `waitingSites` with origins `['a.test', 'a.test', 'DevWallet', 'b.test']` → `2`.
  - `resolutions` maps each request correctly.
  - `orphaned` returns the items whose `requestId` isn't live.
  - `droppedItems` returns the removed ids.
  - **Review Focus #5:** model the background's rule as a pure function and test it.
    `queueAfterNetworkChange(queue, newRpcUrl)` returns `{ queue: null, reject: <all requestIds> }` when the rpcUrl
    differs, and leaves the queue unchanged when it's the same. Also, `orphaned(items, new Set())` after a worker restart
    returns every id.
- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement the pure functions, then the background wiring.**
  - **Sign** (from the batch review in Task 12):
    - `executeCalls` runs on `flattenQueue` with `force`, with `atomicRequired: true`.
    - One `BatchRecord` is stored per queued `wallet_sendCalls`, all sharing the result.
    - Each waiter is resolved via `resolutions`, then the queue is cleared.
  - **A predicted revert without `force`:** every waiter gets the code-`3` error, and the queue is cleared.
  - **Discard, network change and user removals:** the affected waiters get `4001`.
  - **On worker start:** `dropOrphanedRequests` also clears the queue, using `orphaned`.
- [ ] **Step 4: Run the tests to see them pass.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat: Ambire-style batch queue"`

### Task 12: Approval screens, batch review, signatures

**Files:**
- Create: `src/utils/typedData.ts`, `src/hooks/useSendPreview.ts`, `src/components/BatchBar.tsx`,
  `src/screens/batch-review.tsx`
- Test: `src/utils/typedData.test.ts`
- Modify:
  - `src/screens/pending-request.tsx`: `SendCallsRequest`, `SendTransactionRequest`, `PendingRequest_` switch,
    `SignTypedDataRequest`, and a new `SignRequest` for `eth_sign`
  - `src/screens/_layout.tsx`: mount `BatchBar`
  - router registration for `/batch`
  - `src/app.tsx`: listen for `notice` and show a `sonner` toast

**Interfaces:**
- Consumes: `previewSend` and `batchQueue` messages, `batchQueueStore`, `SendPreview`.
- Produces:
  - `describeTypedData(td: { domain?: Record<string, unknown>; types: Record<string, { name: string; type: string }[]>; primaryType: string; message: Record<string, unknown> }): { kind: 'kernel-1271'; account: Address; innerHash: Hex; chainId: number } | { kind: 'generic'; primaryType: string; domain: [string, string][]; fields: { path: string; type: string; value: string }[] }`
  - `useSendPreview(args: { from?: Address; calls: RpcCall[]; atomicRequired: boolean }): UseQueryResult<SendPreview>`

- [ ] **Step 1: Write the failing tests** for `describeTypedData`.
  - A Kernel wrapper (domain name `Kernel`, version `0.3.3`, primaryType `Kernel`, message `{hash}`) →
    `{kind:'kernel-1271', account: domain.verifyingContract, innerHash: message.hash, chainId: 31337}`.
  - A nested Permit2-style message gives generic fields with dotted paths such as `details.amount`.
  - Bigint-ish values are rendered as decimal strings.
- [ ] **Step 2: Run them to see them fail, then implement, then see them pass.** Run `bun test
  src/utils/typedData.test.ts`.
- [ ] **Step 3: Implement the screen behavior.** The information and actions below are required; layout belongs to the
  UX agent.
  - **Send approvals** (`eth_sendTransaction` and `wallet_sendCalls`):
    - Replace per-call `usePrepareTransactionRequests` estimation with `useSendPreview`. Show account mode, payer
      (`Sponsor 0x…` or `Account`), estimated cost (`estimatedCostWei` in ETH, or "unknown"), `fallbackReason` when
      present, path, and simulation status.
    - On failure, show the failing call index and the revert message.
    - Balance changes, when not null.
    - Actions:
      - **Reject**
      - **Add to batch:** smart accounts only, hidden for deployments. It sends status `'batched'`, and the background
        opens the queue if none is open.
      - **Approve**, which becomes **Sign anyway** (sends `force: true`) when the simulation failed
    - When a queue is open for this account, "Add to batch" is the primary action.
  - **Plain-upgradable `wallet_sendCalls`:** show "This account will be upgraded to a Kernel v3.3 smart account (same
    address) before sending."
  - **`BatchBar`:** shown when `batchQueueStore.queue` is set. It shows the item count, the `waitingSites` count, and
    actions **Review** (route `/batch`) and **Discard**.
  - **`/batch` review:**
    - Items in order, each with its origin. Reorder with `moveItem`; remove with `removeItem`.
    - A `wallet_sendCalls` group moves and removes as a unit.
    - Show a combined `useSendPreview({ calls: flattenQueue(items), atomicRequired: true })`.
    - Actions: **Sign batch** / **Sign anyway** (`batchQueue` `sign`), and **Discard**.
    - A wallet-level **Start batch** action (also in `BatchBar`'s empty state on the home screen) calls `openQueue`.
  - **`SignRequest` for `eth_sign`:** shows the address and the hex payload, with approve and reject. This fixes the
    blank screen.
  - **`SignTypedDataRequest`:** renders `describeTypedData`. The Kernel case reads "ERC-1271 signature for Kernel
    account 0x…, inner hash 0x…".
- [ ] **Step 4: Manual check.** Use `bun run dev` with the playground.
  - Approve an `eth_sendTransaction` with "Add to batch", then a second one. The bar shows 2 calls; Review, then Sign
    batch, gives one transaction, and both playground promises resolve with the same hash.
  - A reverting call shows Sign anyway, and signing it gives a reverted transaction.
  - An `eth_sign` from the console renders.
- [ ] **Step 5: Commit.** `git commit -m "feat(ui): batch approvals, batch review, typed-data and eth_sign views"`

### Task 13: Account details and sponsor setting

**Files:**
- Create: `src/hooks/useAccountMode.ts`
- Test: `src/hooks/useAccountMode.test.ts` (only the pure `modeLabel`)
- Modify: `src/screens/account-details/index.tsx`, `src/components/AccountCard.tsx`, `src/screens/settings.tsx`

**Interfaces:**
- Consumes: `setAccountMode` message, `accountModesStore`, `classifyCode`, `settingsStore.sponsor`/`setSponsor`,
  `ENTRY_POINT_07` `getNonce`.
- Produces:
  - `modeLabel(mode: AccountMode, onchain: OnchainKind): string`
  - `useAccountMode(address: Address): { mode: AccountMode; onchain: OnchainKind; set(action: AccountMode | 'switch-to-kernel' | 'revoke'): Promise<void> }`

- [ ] **Step 1: Write the failing tests** for `modeLabel`.
  - (`smart`, `kernel`) → `'Smart · Kernel v3.3'`
  - (`plain-upgradable`, `eoa`) → `'Plain (upgradable)'`
  - (`plain-never`, `eoa`) → `'Plain'`
  - (any, `{kind:'delegated', target}`) → `` `Delegated to ${target} (not Kernel)` ``
  - (any, `contract`) → `'Contract'`
- [ ] **Step 2: Run them to see them fail, then implement, then see them pass.**
- [ ] **Step 3: Implement the UI.**
  - **Account card:** show `modeLabel`.
  - **Account details:**
    - mode and delegation target
    - EntryPoint nonce next to the transaction nonce
    - actions:
      - "Switch to smart" (when plain)
      - "Switch to Kernel" (when delegated elsewhere)
      - "Revoke delegation" (when Kernel)
      - a collapsed "Advanced" disclosure containing the two plain modes
  - **Settings:** a "Gas sponsor" control with DevWallet sponsor (default), any account from the list, or Off.
  - **Kernel conflict warning:** when `smartStatus` returns `{ok:false, conflicts}`, the home screen and account details
    show "Smart accounts are off on this network: unknown code at <conflicts>. DevWallet won't overwrite it."
- [ ] **Step 4: Manual check.** Switch an account to "Plain"; `wallet_getCapabilities` reports `unsupported`, and the
  node shows `0x` code. Revoke on a smart account clears the code and shows "Plain (upgradable)".
- [ ] **Step 5: Commit.** `git commit -m "feat(ui): account modes and gas sponsor setting"`

### Task 14: Transaction views, activity, contract import

**Files:**
- Create: `src/smart/decode.ts`
- Test: `src/smart/decode.test.ts`
- Modify: `src/screens/transaction-details.tsx`, `src/screens/account-details/Activity.tsx`, `src/screens/index.tsx`
  (the contract import around line 845)

**Interfaces:**
- Consumes: `decodeKernelBatch`, `entryPoint07Abi`, `classifyCode`.
- Produces:
  - `type UserOpSummary = { sender: Address; nonce: bigint; success: boolean; actualGasCost: bigint; paymaster: Address; calls: Call[] | null }`
  - `decodeHandleOps(tx: { to: Address | null; input: Hex }, receipt: { logs: { address: Address; topics: Hex[]; data: Hex }[] }): UserOpSummary[] | null`
    (null when it isn't `handleOps` to `ENTRY_POINT_07`)
  - `USER_OPERATION_EVENT` (the ABI item, for log queries)

- [ ] **Step 1: Write the failing tests.**
  - On Anvil, submit a sponsored op (Task 5 helpers) with two calls. `decodeHandleOps` returns one summary with the
    account as `sender`, `success: true`, `paymaster: DEVWALLET_PAYMASTER`, and `calls` deep-equal to the two calls.
  - A plain transfer transaction → `null`.
- [ ] **Step 2: Run them to see them fail, then implement, then see them pass.**
- [ ] **Step 3: Implement the views.**
  - **Transaction details:**
    - Fee rows also render for `transaction.type === 'eip7702'`.
    - For `eip7702`, show the authorization list: chain id, address, nonce, and the recovered authority.
    - When `decodeHandleOps` is non-null, show each user operation (sender, success, paymaster, actual gas cost,
      decoded calls).
  - **Activity:** add the transactions found by `getLogs` for `USER_OPERATION_EVENT` with `sender = account`, labeled
    `Sponsored by <tx.from>`. Keep the existing 7702 handling.
  - **Contract import:** if `classifyCode(code).kind` is `kernel` or `delegated`, fail with "This address is an account
    (EIP-7702 delegated), not a contract."
- [ ] **Step 4: Commit.** `git commit -m "feat(ui): show 7702 and user-operation transactions"`

### Task 15: Playground, docs, end-to-end check

**Files:**
- Modify: `test/dapp/App.tsx` (EIP-5792 v2 params: `version: '2.0.0'`, `chainId`, `atomicRequired`; status shows the
  numeric code), `README.md` (a "Smart accounts" section: modes, sponsor, batch queue, Hardhat note,
  `bun run aa:generate`)

- [ ] **Step 1: Update the playground and README.**
- [ ] **Step 2: Full suite.** Run `bun test src/ && bun run typecheck && bun run lint`. Expected: all pass. Run it once
  more with `HARDHAT_RPC_URL` pointing at a running `npx hardhat node` (Hardhat 3); expected: the Hardhat tests pass
  too.
- [ ] **Step 3: End-to-end against d1.** Run d1's `dapp/scripts/dev-stack.sh`, load the built extension, and open d1.
  1. Connect, and confirm the connected account's code is `0xef0100d6ce…`.
  2. Run one of the atomic-only SDK workflows (for example a conversion); it succeeds as one EntryPoint transaction
     paid by the sponsor.
  3. Do an FHE permit signature flow; d1 logs "signing ACPs through ERC-1271", and the ACL accepts it.
  4. Switch the account to "Plain" (Advanced); after a d1 reload, the same workflow falls back to one-by-one sends.
  5. With bypass on and a batch started, click two actions in d1; both join the queue, and Sign batch resolves both.
- [ ] **Step 4: Commit.** `git commit -m "docs: smart accounts; playground on EIP-5792 v2"`

---

**Out of this plan (spec "d1 follow-ups"):** agent powers for connected wallets, and the capabilities cache. They are
done in the d1 repo afterwards.
