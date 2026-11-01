# Smart accounts for DevWallet — design

Date: 2026-11-01 · Branch: `smart-accounts` · Status: builder-reviewed, awaiting approval

## Why

DevWallet is a keyless developer wallet for local chains (Anvil, Hardhat 3, chain id 31337). It drives the node's
unlocked accounts and `anvil_impersonateAccount`, and it holds no private keys. Today it behaves like a 2019 EOA wallet.

The main consumer is the d1/obolos dApp (`/Users/petros/projects/petros/d1/dapp`). In production, d1's users have Privy
embedded wallets that are EIP-7702 delegated to ZeroDev **Kernel v3.3** (EntryPoint **v0.7**). They send user
operations through d1's `/sponsor` backend, which proxies Pimlico's bundler and paymaster. Every action is one atomic,
gas-sponsored operation from the user's own address.

On Anvil none of that runs. `SPONSOR_URL` is undefined on chain 31337 (`dapp/src/lib/auth/pimlico.ts`), so d1 talks to
DevWallet as an external wallet:

- DevWallet's `wallet_getCapabilities` returns the legacy `atomicBatch: { supported: false }`, which viem 2.57 does not
  read. d1's `useBatchSend` (`dapp/src/lib/wallet.ts`) therefore sends every call one by one, with a popup per call.
- d1's SDK workflows that require atomicity (`services/sdk/src/tx.ts`, used by compliance, conversions and instruments
  workflows) **throw locally**. Those features cannot be exercised on a local chain at all.
- d1's Kernel-specific code never runs locally. That includes the ERC-1271 `Kernel(bytes32 hash)` signature wrapping in
  `delegatedSigner` (`dapp/src/lib/chain/fhe.ts`), the `kernelDelegated` checks, and agent powers built on ZeroDev
  permission validators.

The goal is to bring DevWallet up to the current generation of wallets, modelled on Ambire. Accounts become smart
accounts at the same address via 7702, with real atomic batching, gas sponsorship and a batch queue. The production code
path can then be developed and debugged locally.

## Goals

1. **Smart by default.** Every dev account is a Kernel v3.3 smart account via 7702, at its own address, with no setup.
2. **Real EIP-5792 v2.** `wallet_getCapabilities`, `wallet_sendCalls`, `wallet_getCallsStatus` and
   `wallet_showCallsStatus` follow the final spec and work with viem 2.57's `sendCalls` / `waitForCallsStatus` /
   `getCapabilities`. Batches are truly atomic: one transaction, all calls succeed or none do.
3. **Gas sponsorship without external services.** A sponsor pays gas for smart accounts through a real EntryPoint
   `handleOps` and a paymaster, which mirrors production. It is on by default.
4. **Ambire-style batch queue.** Requests from dApps and from DevWallet's own screens can be collected into one batch,
   reviewed together, and signed once.
5. **Plain accounts still testable.** Hidden per-account modes keep plain EOAs available, both one that offers to
   upgrade and one that never batches. dApp fallback paths stay testable.
6. **Fidelity.** Errors, revert reasons, receipts and statuses reach the dApp intact, and nothing makes a dApp look
   healthier locally than it would be in production.
7. **Anvil and Hardhat 3 parity** for everything above.

## Non-goals

- Gas Tank, paying gas in ERC-20s, cross-chain gas.
- ERC-7677 `paymasterService` (dApp-supplied paymaster URLs). Don't advertise it.
- ERC-7715 / ERC-7710 permissions, session keys, or installing ZeroDev permission modules. d1's dev stack etches those
  itself.
- Smart account implementations other than Kernel v3.3 (Safe, Ambire, Coinbase). Keep the code shaped so another
  implementation could be added later, but build only Kernel.
- Auto-batching (merging requests on a timer under auto-approval). We considered and dropped it: smart-account dApps
  already batch through `wallet_sendCalls`, and merging separate transactions behind the dApp's back would hide bugs.
- Real type-4 upgrade transactions with signed authorizations. DevWallet has no keys, so the upgrade uses `setCode`
  (see below).
- ERC-6492 / ERC-8010 signature wrapping.
- Visual design. A separate UX agent owns layout and styling. This document specifies behavior and which information
  must be visible, not how it looks.

## Anti-goals (failure even if it "works")

- **A dApp passes locally but would fail in production.** Examples: hiding reverts, reporting success for a reverted
  batch, faking atomicity, returning signatures production wallets wouldn't.
- **Requiring a bundler, paymaster server, Docker or any external service** to get smart accounts or sponsorship.
- **Silently overwriting on-chain state the user didn't expect**, such as replacing a contract's code or another
  wallet's delegation. Any state DevWallet changes must be visible in the UI.
- **Breaking existing plain-EOA users or impersonation workflows.**
- **Adding private keys to DevWallet.** It stays keyless.

## Constraints and facts the builder can rely on

These were verified on 2026-11-01 against Anvil 1.7.1, Hardhat 3.21.2 (EDR), viem 2.57.13 source and Kernel on mainnet.

- **7702 on local nodes.** Anvil's default hardfork has 7702 on, and so does Hardhat 3's default (Osaka).
  `anvil_setCode` / `hardhat_setCode` with `0xef0100 ‖ impl` produce a working delegation, and `setCode 0x` removes it.
  Impersonated EOAs can send transactions to themselves.
- **Canonical addresses.** These must be exact, because d1 compares code byte-for-byte:
  - EntryPoint v0.7: `0x0000000071727De22E5E9d8BAf0edAc6f37da032`
  - SenderCreator (its address is baked into EntryPoint): `0xEFC2c1444eBCC4Db75e7613d20C6a62fF67A167C`
  - Kernel v3.3 7702 implementation: `0xd6CEDDe84be40893d153Be9d467CD6aD37875b28`. This is
    `KERNEL_7702_DELEGATION_ADDRESS` in `@zerodev/sdk`. d1's `kernelDelegated` requires code exactly equal to
    `0xef0100d6cedde84be40893d153be9d467cd6ad37875b28`.
- **Runtime code.** Kernel (~24 KB) and EntryPoint (~16 KB) are small enough to ship as constants in the extension, with
  their immutables baked in. They can be copied with `eth_getCode` from mainnet. Installing these three with `setCode`
  was enough for `handleOps` to succeed on both nodes.
- **Kernel's runtime code differs per source chain.** Its deploy-time immutables include the cached chain id and EIP-712
  domain separator. d1 keeps a copy in
  `/Users/petros/projects/petros/d1/services/simulations/harness/aa-code.json`, taken from **Arbitrum Sepolia**
  (421614), along with ZeroDev permission modules DevWallet doesn't need. That copy differs from mainnet's in those
  immutables only (68 hex chars). Both behave identically as a 7702 delegate, because the domain is recomputed when
  running at the user's address. EntryPoint and SenderCreator are identical across chains.
- **Hardhat specifics.** Hardhat has no CREATE2 deployer. EDR rejects transaction objects carrying both `data` and
  `input`.
- **Kernel self-call.** In 7702 mode, Kernel v3.3's `execute(bytes32 mode, bytes executionCalldata)` accepts calls from
  the EntryPoint or from the account itself. Calls from anyone else revert.
  - The mode is 32 bytes: callType (`0x00` single, `0x01` batch), execType (`0x00` revert on failure), 4 unused bytes, a
    4-byte selector and a 22-byte payload.
  - Batch calldata is `abi.encode((address target, uint256 value, bytes data)[])`.
  - A self-sent batch was verified locally. Single-call packed encoding was not verified; prefer batch mode even for one
    call unless you verify single mode.
- **Kernel user-op validation.** In 7702 mode the validator id is zero, and Kernel checks
  `ECDSA.recover(toEthSignedMessageHash(userOpHash), sig) == address(this)`. The signature is the node's
  `eth_sign`/`personal_sign` over the 32-byte userOpHash: 65 bytes, no prefix byte, nonce key 0. Only accounts the node
  can sign for (unlocked dev accounts) can produce one. **Impersonated accounts cannot sign user operations.**
- **Kernel ERC-1271.** Verification expects `0x00 ‖ signTypedData({ domain: { name: "Kernel", version: "0.3.3",
  chainId, verifyingContract: account }, types: { Kernel: [{ name: "hash", type: "bytes32" }] } })`. `eip712Domain()`
  is exposed. d1 builds this wrapper itself, so DevWallet must not wrap.
- **viem 2.57 behavior.**
  - `getCapabilities` does not merge the `"0x0"` key into chain entries, so DevWallet must return an explicit
    `"0x7a69"` entry.
  - viem ignores the legacy `atomicBatch` key.
  - `sendCalls` sends `version: "2.0.0"` and `atomicRequired` from `forceAtomic`.
  - `getCallsStatus` maps numeric codes (1xx pending, 2xx success, ≥3xx failure) and treats a missing `atomic` as false.
- **Existing stack.** React 18, zustand stores persisted to `chrome.storage.local`, viem 2.57, vanilla-extract, bun
  (`bun test`). Prefer viem's account-abstraction utilities (`getUserOperationHash`, `entryPoint07Abi`, etc.) and plain
  ABI encoding. Adding `@zerodev/sdk` or `permissionless` is the builder's call, if it removes real work and doesn't
  bloat the extension.
- **d1's local setup.** d1 runs `anvil --chain-id 31337 --block-time 10 --mixed-mining` and etches EntryPoint, Kernel
  and ZeroDev modules itself (`dapp/scripts/dev-stack.sh`). It deploys from Anvil account #9.

## What gets built

### 1. Account modes

Each account has a **mode**, stored per account (keyed by network RPC URL + address). The mode must survive
`setJsonRpcAccounts` re-syncs. Today `src/zustand/account.ts` keeps only `displayName` and would wipe a new field.

| Mode | On-chain state | `atomic` capability | Shown where |
|---|---|---|---|
| **Smart** (default for dev accounts) | delegated to Kernel v3.3 | `supported` | account list + details |
| **Plain, upgradable** | no code | `ready` | account details (hidden option) |
| **Plain, never upgrades** | no code | `unsupported` | account details (hidden option) |

- **Becoming smart.** DevWallet writes `0xef0100 ‖ Kernel` with the node's setCode. This is a deliberate shortcut: it
  needs no signature and works for impersonated accounts. Production uses a type-4 transaction instead.
- **Becoming plain.** DevWallet clears the code (`setCode 0x`).
- **Eager, not lazy.** The on-chain state must match the claimed mode before a dApp asks. d1 reads code when signing,
  to decide between raw and ERC-1271 signatures. So when an account appears, is switched, or the node is reset (state
  wiped), DevWallet makes the on-chain state match the mode. It must also notice a reset and redo this.
- **Impersonated accounts** start in their real on-chain state, untouched. The user can switch one to Smart explicitly.
  - An impersonated address with no code starts as **Plain, never upgrades**. It reports `unsupported`, so a dApp like
    d1 falls back to one-by-one sends, and DevWallet never writes code to it without a click.
  - An impersonated address already delegated to Kernel starts as Smart.
  - (My call: impersonation is about mimicking a real address.)
- **Bypass and the upgrade prompt.** The upgrade offer for a Plain, upgradable account counts as a transaction approval.
  With "Bypass Transaction Authorization" on, the upgrade happens without a prompt, and DevWallet shows a notice that the
  account was upgraded. This mode is only ever chosen explicitly in account details, and impersonated accounts never
  start in it, so a silent write only happens to accounts the user opted in. (My call.)
- **Addresses DevWallet must not overwrite:**
  - An address that holds a real contract can't be made smart. Show it as a contract.
  - An address already delegated to something other than Kernel is shown as "delegated to `0x…` (not Kernel)" and treated
    as `unsupported` for batching, like MetaMask does. Account details offer "Switch to Kernel", which overwrites it
    only when the user clicks it.
- **Plain, upgradable.** When a `wallet_sendCalls` arrives, the approval screen says the account will be upgraded to a
  Kernel smart account. Approving upgrades the account (setCode) and then executes the batch. Declining returns error
  `5750`. The upgrade persists, so the mode becomes Smart.
- **Plain, never upgrades.** `wallet_sendCalls` with `atomicRequired: true` fails with `5760`. With
  `atomicRequired: false`, the calls are sent as separate transactions in order, and the status reflects them: `200` if
  all succeed, `600` if partly reverted, `500` if all reverted. This is the mode that exercises d1's one-by-one fallback.
- Mode changes must not emit `accountsChanged`. Addresses didn't change. Today a deep compare of account objects in
  `app.tsx` would fire it, so fix that.

### 2. Contract setup

On connecting to a network (and after a detected reset), DevWallet checks code at the canonical EntryPoint, SenderCreator
and Kernel addresses, plus the DevWallet paymaster (below).

- **Missing:** install with setCode from bundled runtime code. Ship the mainnet builds.
- **Present and recognized:** do nothing. This covers forks of chains that have them and d1's dev stack.
  - EntryPoint and SenderCreator: recognized when the code is byte-identical.
  - Kernel: recognized when it matches a known v3.3 build with the deploy-time immutables (cached chain id, domain
    separator) masked out. Known builds are at least mainnet and Arbitrum Sepolia, which is d1's copy.
  - (My call: an exact match would wrongly flag d1's dev stack, and masking only those immutables keeps the
    "don't overwrite unknown code" rule meaningful.)
- **Present but unrecognized:** don't overwrite. Show a warning, and treat smart features as unavailable on that
  network.

Installation order doesn't matter. d1's `dev-stack.sh` writes its own copy unconditionally, and DevWallet accepts it.

Record where each bundled or fingerprinted build came from (chain, block, address) next to the constants, and add a
script that regenerates them.

### 3. Node abstraction (Anvil and Hardhat 3)

DevWallet hard-codes `anvil_*` today: `testActions({ mode: 'anvil' })` in `src/viem.ts`, and `anvil_getAutomine` /
`anvil_mine` in `src/entries/background/rpc.ts`. On Hardhat those calls fail quietly.

- Detect the node with `web3_clientVersion`.
- Route setCode, setBalance, impersonate/stop impersonating, mine, automine, setNonce and setStorageAt to the right
  method family.
- Every node cheat the new features use goes through this layer.

**Chain id bug, must fix.** `buildChain` gives the viem client chain id 1 (`src/viem.ts`). Anything that reads
`client.chain.id` would compute userOpHashes and EIP-712 domains for the wrong chain. Use the node's real `eth_chainId`.

### 4. Execution paths

Requests that send — `eth_sendTransaction`, `wallet_sendCalls`, and DevWallet's own Write and Transfer screens — run
through one execution layer:

| Account | Sponsorship | Path | Who pays | `tx.origin` |
|---|---|---|---|---|
| Smart, node can sign | on | **User operation.** Build a v0.7 PackedUserOperation (nonce key 0, calls encoded as Kernel `execute` batch, DevWallet paymaster). The node signs the userOpHash as the account. The sponsor calls `EntryPoint.handleOps([op], beneficiary = sponsor)`. | sponsor (via paymaster) | sponsor (mirrors production's bundler) |
| Smart, impersonated | on | **Self-call:** account → itself, `execute(batch, calls)`. The approval screen states "not sponsored: impersonated accounts can't sign". | account | account |
| Smart | off | Self-call | account | account |
| Plain (either) | n/a | Normal `eth_sendTransaction`, one per call | account | account |

- A single `eth_sendTransaction` from a smart account takes the same path as a one-call batch, so d1's ethers path (which
  is sponsored in production) is sponsored locally too. The dApp gets back the hash of the transaction that carried it.
  For the user-op path, that's the `handleOps` transaction.
- **Reverts.** Every send is simulated before it goes out, on every path. (My call, consistent with the mockup the user
  saw.)
  - **Simulation fails and nobody is asked** (bypass on, or a batch flushed without review): don't send. Return the
    revert to the dApp as a JSON-RPC error from the request itself, with code `3` and the revert data in `data`. This
    mirrors production, where Pimlico's bundler refuses a user operation that fails gas estimation. For
    `wallet_sendCalls` the error comes from the call; no id is issued.
  - **Simulation fails and the user clicks "Sign anyway"** on an approval or batch review: send it through the
    **self-call path** (account pays), even if sponsorship is on. The transaction itself then reverts on chain. Its
    receipt shows status `0`, queued `eth_sendTransaction` callers see a failed receipt, and `wallet_getCallsStatus`
    reports `500`. Never send a predicted-reverting call through `handleOps`, because its outer receipt would say
    success. Impersonated and plain accounts already use self-paid paths.
- **Remaining fidelity gap (documented, not hidden).** If the simulation passes but the user operation still reverts
  (state changed between simulation and inclusion), the `handleOps` transaction succeeds anyway. Only
  `UserOperationEvent.success` says otherwise. Production behaves the same way.
  - `wallet_getCallsStatus` derives status and receipt `status` from `UserOperationEvent.success`, not the outer receipt.
  - The Activity and transaction views show the user operation's real outcome.
- **Contract deployments** (a send with no `to`, including DevWallet's Deploy button and `test/dapp` deploys) go out as a
  normal transaction from the account, paid by the account, in every mode. A 7702-delegated EOA can still originate a
  creation transaction, and `receipt.contractAddress` and contract discovery keep working.
  - Kernel's `execute` can't create, and Hardhat has no CREATE2 deployer.
  - Deployments can't join a batch, so "Add to batch" is hidden for them.
  - A `wallet_sendCalls` containing a call without `to` is rejected with `-32602` and a clear message.
  - (My call: production embedded wallets don't deploy, and this keeps deploy workflows exactly as they are today.)
- Batches use execType "revert on failure", so a batch is all or nothing.
- The automine on/off hack in `handleSendCalls` goes away. Atomicity now comes from one transaction.

### 5. Sponsorship

- **On by default.** It's a global setting with three choices:
  - **DevWallet sponsor (default):** a dedicated, fixed address that DevWallet owns, impersonates and keeps funded with
    setBalance when low. It never collides with nonces of accounts that scripts use (d1 deploys from account #9).
  - **Any account:** the user picks one; unlocked or impersonated both work as the sender of `handleOps`.
  - **Off.**
- **The paymaster** is a minimal accept-all v0.7 paymaster contract that DevWallet ships. It is installed at a fixed
  DevWallet address with setCode, and its EntryPoint deposit is topped up from the sponsor (`depositTo`) when low. Using
  a real paymaster rather than pre-depositing for the account mirrors production. Receipts show a paymaster, and the
  account's ETH balance doesn't move. The contract source lives in `test/contracts` (Foundry) or a new `contracts/`
  folder; that's the builder's call.
- **Must be visible:** wherever a send is approved or shown, show who pays and how much (estimated, then actual). If the
  sponsor or paymaster can't be funded (for example the node refuses setBalance), fall back to the account paying, and
  say so on the approval screen.

### 6. EIP-5792 v2 (exact behavior)

- **`wallet_getCapabilities(address, chainIds?)`**
  - Answers for the requested address and chains.
  - Returns an explicit hex-chain entry (`"0x7a69"`), not only `"0x0"`.
  - `atomic.status` comes from the account's mode table above.
  - Advertise nothing else.
- **`wallet_sendCalls`**
  - Requires `version: "2.0.0"`. Honors `chainId` (a chain other than the active network's → `5710` Unsupported Chain Id, per EIP-5792), `from` (defaults to the
    active account) and `atomicRequired`.
  - Rejects unknown non-optional capabilities with `5700` and ignores optional ones.
  - Accepts a dApp-supplied `id` (duplicate → `5720`) or generates a unique one.
  - Returns `{ id }`.
  - The batch record is stored at submission time, keyed by id **and network**.
- **`wallet_getCallsStatus(id)`**
  - Returns `{ version, id, chainId, status, atomic, receipts }`.
  - Status codes: `100` pending, `200` success, `500` reverted, `600` partially reverted (plain mode only), `400` failed
    before sending.
  - Unknown id → `5730`.
  - Receipts carry hex fields, with logs filtered to the batch's user operation where applicable.
- **`wallet_showCallsStatus(id)`** opens the batch's transaction in DevWallet. Unknown id → `5730`.
- **Store hygiene.** The batch store (`src/zustand/batch-calls.ts`) is scoped per network, cleared on node reset or
  network reset, and pruned. `getBatchFromTransactionHash` must handle several batches sharing one transaction.
- **Playground.** Update `test/dapp` (the manual playground) to v2 params.

### 7. Batch queue (Ambire-style)

- **Opening a batch.** An open batch belongs to one smart account on one network, and there is at most one at a time.
  It opens from either:
  - **"Add to batch"** on any approval screen for that account. This applies to dApp `eth_sendTransaction` and
    `wallet_sendCalls`, and to DevWallet's own Write (contract details) and Transfer screens.
  - **"Start batch"**, a wallet-level action.
- **Rules (agreed).**
  - **Bypass decides whether you're asked.** "Bypass Transaction Authorization" off: each request shows its approval
    screen; "Add to batch" is the primary action while a batch is open. Bypass on: no popup.
  - **An open batch decides where a request goes.** No batch: the request is sent immediately. Batch open: the request
    joins it, including silently when bypass is on.
- **While queued.**
  - The dApp's request stays pending. Queued requests must not hit the existing 5-minute pending-request expiry.
  - A `wallet_sendCalls` joins as a group that stays together (it can be moved or dropped as a unit, not split).
  - The batch shows how many sites are waiting on it, so a dApp that waits for one receipt before sending the next
    request (which will stall) is easy to spot.
- **Review.**
  - Calls in order, with each call's origin (site or DevWallet screen).
  - Reorder and remove.
  - Simulated together as one execution.
  - Balance changes. Native and ERC-20 are required; NFTs are nice to have.
  - Account mode, who pays, and estimated cost.
  - A failing simulation highlights the failing call with its revert reason. "Sign anyway" stays possible on purpose,
    because this is a dev wallet. It sends through the self-call path so the revert is visible on chain (§4).
  - A batch flushed with nobody reviewing it follows the "nobody is asked" rule in §4: refused with the revert as an
    error, and every waiting request gets that error.
- **Signing.**
  - One execution through the path in §4.
  - Each queued `eth_sendTransaction` resolves with the carrying transaction's hash.
  - Each queued `wallet_sendCalls` resolves with its id, and its status reflects the shared execution.
- **Discarding.** Every waiting dApp request is rejected with `4001`.
- **Plain accounts don't get "Add to batch".** A plain-upgradable account gets the upgrade offer instead (§1).

### 8. Approval screens and signatures

- **Batch approvals simulate the batch as one execution.** For a smart account, that's a call of `execute(batch, calls)`
  from the account to itself, or `eth_simulateV1` where the node supports it. Today each call is estimated alone
  (`src/hooks/usePrepareTransactionRequest.ts`), so approve-then-spend batches show false failures, and DevWallet's own
  pre-simulation aborts them.
- **Show account mode and payer** on every send approval.
- **Signatures stay plain EOA signatures in every mode.** `personal_sign` and `eth_signTypedData_v4` are signed by the
  node as the EOA, and DevWallet never wraps them. d1 does its own Kernel wrapping, and production embedded wallets
  return raw signatures too. Impersonated accounts still can't sign, as today.
- **Typed data renders as structured fields,** not raw JSON. Recognize the Kernel wrapper and label it ("ERC-1271
  signature for Kernel account 0x…, inner hash …").
- **Add the missing `eth_sign` approval view.** Today a direct `eth_sign` request renders nothing and blocks the sidebar
  until it expires.

### 9. Errors

- **Node errors keep their code, message and `data`** (revert data) all the way to the dApp. Today
  `src/entries/inpage/provider.ts` keeps only 4001/4100/4200 and turns everything else into `UnknownRpcError` with code
  -1.
- **Errors thrown in background handlers** (`handleSendCalls` and the new execution layer) carry proper EIP-1193 /
  EIP-5792 codes, not a bare `Error`.
- **Remove the dead `success === false` branch** in `rpc.ts`, which returns `error` as a string.

### 10. Views

- **Account details:**
  - mode, and delegation target as a readable name ("Kernel v3.3") with the address
  - switch mode, including the hidden plain modes
  - revoke delegation
  - EntryPoint nonce alongside the transaction nonce
- **Transaction details:**
  - type-4 fees and the authorization list (today fee rows render only for `eip1559`)
  - for `handleOps` transactions, each user operation: sender, success, paymaster, actual gas cost, decoded inner calls
- **Activity** (`src/screens/account-details/Activity.tsx`):
  - include transactions where a `UserOperationEvent` names the account as `sender`, labeled "Sponsored by …"
  - keep the existing 7702 authorization handling
- **Contract import must not treat a delegated EOA as a contract.** Code starting `0xef0100` is an account.

### 11. Bug fixes in scope

- **`eth_accounts` leaks accounts from other networks.** `getAccounts({ activeFirst: true })` rebuilds the list from the
  unfiltered array (`src/zustand/account.ts`). Fix and test it.
- **`wallet_requestPermissions` / `wallet_getPermissions`** (EIP-2255, at least `eth_accounts`) behave like the connect
  flow. d1's "link another account" flow uses them and fails today. (My call: small, and d1 needs it.)
- **The sidebar auto-open list** (`wallet-sidebar.ts`) duplicates the approval list in `rpc.ts`. Derive both from one
  source so new methods can't drift.

## Testing (required)

- Integration tests run against a real Anvil, and against Hardhat 3 where the dependency is reasonable. They use `bun
  test` and cover the background RPC layer, with viem's own `sendCalls` / `waitForCallsStatus` / `getCapabilities` as
  the client to prove compatibility. They must cover at least:
  - capabilities per mode
  - atomic success
  - predicted revert with nobody asked (error code `3` with revert data, nothing sent)
  - "Sign anyway" on a reverting batch (self-call path, nothing applied, receipt status `0`, status `500`)
  - sponsored vs self-paid balances
  - impersonated account path
  - plain-never sequential path (statuses 200/600)
  - a deployment from a smart account (`contractAddress` set)
  - contract setup on a fresh chain
  - Kernel recognized when d1's Arbitrum Sepolia copy is already present
  - reset re-application
  - error code and revert data pass-through
  - the `eth_accounts` fix
- Test a Kernel ERC-1271 signature end to end: d1-style wrapped typed data, signed through DevWallet, verified with
  `isValidSignature` on the delegated account.
- UI behavior is verified manually in the extension against the `test/dapp` playground and against d1's dev stack.

## d1 follow-ups (separate work in the d1 repo, after DevWallet ships)

1. **Agent powers for connected wallets.** `useAgentPowers.ts` skips call powers when `!owner.embedded`. `delegate()` in
   `lib/auth/sponsor.ts` does nothing for non-embedded wallets. With DevWallet's smart-by-default accounts already
   delegated to Kernel, the owner path in `lib/auth/pimlico.ts` doesn't need Privy's `signAuthorization`. Open these
   gates when the connected account is Kernel-delegated.
2. **Capabilities cache.** `useBatchSend` reads capabilities with `staleTime: Infinity`. Refetch them (for example on
   window focus or account change), so switching a DevWallet account's mode is picked up without a reload.

## Left to the builder

- Code structure, store shapes and module boundaries.
- How bytecode constants are bundled and regenerated.
- The paymaster contract source.
- The simulation mechanism (`eth_call` of `execute` vs `eth_simulateV1`).
- How resets are detected.
- The sponsor's fixed address and funding thresholds.
- Batch id format.
- Library choices within the constraints above.
- All layout and visual design (owned by the UX agent). This document only fixes what must be shown and which actions
  exist.
