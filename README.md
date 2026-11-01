<p align="center"><strong>Developer wallet & DevTools for Anvil & Hardhat</strong></p>

<div align="center">

[//]: # (  <a href="https://chrome.google.com/webstore/detail/rivet/mobmnpcacgadhkjfelhpemphmmnggnod">)

[//]: # (    <img alt="Chrome Web Store Version" src="https://img.shields.io/chrome-web-store/v/mobmnpcacgadhkjfelhpemphmmnggnod">)

[//]: # (  </a>)
  <a href="https://github.com/equitylayer/dev-wallet/actions/workflows/on-push-to-master.yml">
    <img alt="GitHub Workflow Status" src="https://img.shields.io/github/actions/workflow/status/equitylayer/dev-wallet/on-push-to-master.yml">
  </a>
  <a href="https://github.com/equitylayer/dev-wallet/blob/master/LICENSE">
    <img alt="GitHub" src="https://img.shields.io/github/license/equitylayer/dev-wallet">
  </a>
</div>

Forked and modified from [Rivet](https://github.com/paradigmxyz/rivet) (MIT licensed) by Paradigm. Original license retained.

## What is DevWallet?

DevWallet is a developer Wallet & DevTools for local Ethereum nodes — [Foundry Anvil](https://book.getfoundry.sh/anvil/) and [Hardhat 3](https://hardhat.org/) (akin to [Browser DevTools](https://developer.mozilla.org/en-US/docs/Learn/Common_questions/Tools_and_setup/What_are_browser_developer_tools#how_to_open_the_devtools_in_your_browser) or [React DevTools](https://react.dev/learn/react-developer-tools)). It is a browser extension that enables developers to inspect, debug, modify, and manipulate the state of Ethereum: accounts, blocks, contracts & the node itself. DevWallet is also compatible with any production dApp, meaning you can simulate any type of action from either an Account attached on the local instance, or by "impersonating" another Account on the network.

It connects to any local node on chain id `31337` (the default for both `anvil` and `npx hardhat node`), and can import deployed contracts & their ABIs directly from your Foundry or Hardhat project on disk.

By integrating [EIP-6963: Multi Injected Provider Discovery](https://eips.ethereum.org/EIPS/eip-6963), DevWallet is designed to be used alongside and with other consumer browser wallets like MetaMask or Rainbow to provide more engrained developer tooling and workflows for Ethereum.

DevWallet is aimed to be **contributor first & friendly**. If you would like to contribute, check out the [Contributing Guide](/.github/CONTRIBUTING.md).

**3.0.0** is the smart-accounts and redesign release. The node's dev accounts are now EIP-7702 smart accounts by default, with sponsored user operations, EIP-5792 v2 batches and a batch queue, all in a redesigned side panel. See [Smart accounts](#smart-accounts).

## Why was it forked?

Development had slowed down and many issues were left open.

## Download

- **Chromium (Chrome, Brave, Arc, etc)** [[Download]](https://chromewebstore.google.com/detail/emajibkjkkilgdahffjhapcljjhhdpeb?utm_source=item-share-cb)
- **Firefox**: coming soon

### Nightly Release

DevWallet is currently in active development. If you would like to try out the latest features, you can download the latest nightly build below:

- **Chromium (Chrome, Brave, Arc, etc)**: [Download](https://github.com/equitylayer/dev-wallet/releases/latest)

<details>
  <summary>Setup Instructions</summary>
  <ol>
    <li>Download the asset `extension.zip` from the link above</li>
    <li>Unzip the downloaded file</li>
    <li>Open your chromium browser and navigate to <code>chrome://extensions</code></li>
    <li>Enable <code>Developer Mode</code> in the top right corner</li>
    <li>Click <code>Load Unpacked</code> in the top left corner</li>
    <li>Select the unzipped folder</li>
    <li>Done! You should now see the DevWallet extension in your browser</li>
  </ol>
</details>

## Features

- **Onboarding**
  - Set up local Anvil instance
  - Configure & deploy Anvil instance (fork block number, fork rpc url, base fee, gas limit, etc)
- **Anvil Node/Chain**
  - Configure fork settings (block number, RPC URL, chain ID, etc)
  - Configure block config (base fee, gas limit, timestamp interval, etc)
  - Automatic sync with Anvil instance
  - Reset instance*
  - Deploy a new instance*
  - Switch between instances*
- **Accounts**
  - List Anvil-attached and impersonated accounts
  - View balances, nonces, and other account details
  - Inspect, connect, and manage accounts
  - Impersonate accounts
  - Set balances & nonces
  - View & set ERC20/721/1155 balances*
  - Import Private Key/HD accounts*
- **Smart accounts** ([details](#smart-accounts))
  - Dev accounts delegated to Kernel v3.3 with EIP-7702, on by default
  - Smart, Plain (upgradable) and Plain modes, switched on the Account home
  - Gas sponsorship: ERC-4337 v0.7 user operations paid through DevWallet's paymaster
  - EIP-5792 v2: `wallet_getCapabilities`, `wallet_sendCalls`, `wallet_getCallsStatus`, `wallet_showCallsStatus`
  - Batch queue: collect a dApp's sends, review and reorder them, then sign them as one transaction
- **Block**
  - Infinite scroll through previous blocks
  - View block details & transactions
  - Toggle between "click-to-mine", interval mining, and auto-mining
  - Time-travelling (rewind & replay)*
- **Contract**
  - Import deployed contracts & ABIs from a local project directory:
    - Foundry — `broadcast/` run logs + `out/` artifacts
    - Hardhat 3 — Ignition deployments (`ignition/deployments/chain-31337/`)
    - Hardhat — the `hardhat-deploy` plugin (`deployments/<network>/`)
  - Auto-discovery of contracts & ABIs deployed to the running node
  - Read & write interactions with intuitive UI to represent ABI data structures*
  - Inspect & set storage slots*
  - Inspect & set bytecode*
  - Deployment details (compiler version, optimization + runs)*
  - Inspect contract source code*
- **Transaction**
  - Infinite scroll through previous & pending transactions
  - View transaction details (including decoded calldata, logs, state*, and tracing*)
  - EIP-7702 authorizations, and the user operations a `handleOps` transaction ran
  - Filter transactions by block, account, and status*
  - Update transactions in Anvil mempool*
- **Dapp Connections**
  - Connect to Dapps with your Anvil (and impersonated) account(s)
  - Send transactions, sign messages & typed data, etc
  - Approvals preview the outcome: simulation, balance changes, and who pays the gas
  - Signing views show what gets signed, and warn when a payload looks like a hash
  - Account authorization & "Instant Connect" mode*
  - Edit a transaction request before approving it (gas, fees, nonce, etc)
- **Other**
  - EIP-6963: Multiple Injected Provider Discovery
  - Light & Dark Mode
  - Keyboard shortcuts*

\* = Planned feature

## Getting Started

### 1. Clone the repository

Clone the repo to your local machine using git:

```bash
git clone https://github.com/equitylayer/dev-wallet.git
```

### 2. Install Bun

DevWallet uses [Bun](https://bun.sh). You need to install **Bun v1 or higher**.

You can run the following commands in your terminal to check your local Bun version:

```bash
bun -v
```

If the versions are not correct, or you don't have Bun installed, download and follow their setup instructions:

- Install [Bun](https://bun.sh/docs/installation)

### 3. Install dependencies

Once in the project's root directory, run the following command to install the project's dependencies:

```bash
bun i
```

### 4. Run the dev server

After you have installed dependencies, you are ready to run the dev server for the Extension. To do so, run the following:

```bash
bun run dev 
```

This will run a script that will build the Web Extension, start a dev server for the Test Dapp, and automatically open Chrome with a fresh profile and the extension installed.

### 5. Run the checks

Unit tests run on [Bun's test runner](https://bun.sh/docs/cli/test). Type-checking and linting mirror the pre-commit hook:

```bash
bun run test       # unit tests
bun run typecheck  # tsc --noEmit
bun run lint       # eslint src/
```

## Multi-Wallet Support

DevWallet supports both legacy `window.ethereum` injection and modern [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963) multi-wallet discovery.

**EIP-6963 Support:**
- DevWallet announces itself via EIP-6963, allowing dapps to discover it alongside other wallets
- If another wallet (MetaMask, Coinbase, etc.) is already installed, DevWallet will NOT overwrite `window.ethereum` to avoid conflicts
- Dapps that support EIP-6963 can present users with a wallet selector to choose between DevWallet and other installed wallets
- The test dapp (served by `bun run dev`) demonstrates EIP-6963 wallet discovery

**Legacy Dapp Compatibility:**
- If no other wallet is present, DevWallet will inject itself as `window.ethereum` for compatibility with older dapps
- For testing legacy dapps, run DevWallet in its own Chrome profile without other wallets installed

Helpful note: A fresh Chrome profile gets instantiated when running the dev script: `bun run dev`.

## Smart accounts

Since 3.0.0, the node's dev accounts are smart accounts: each is an EOA delegated to [Kernel v3.3](https://github.com/zerodevapp/kernel) with EIP-7702. A dApp sees the same address, and messages are still signed with the account's own key.

### Modes

Each account has a mode per network, shown on the Account home:

| Mode | How it sends |
|---|---|
| **Smart** (the default) | Delegated to Kernel. Its sends go out as one atomic Kernel batch: a sponsored user operation, or a transaction to itself. |
| **Plain (upgradable)** | As an EOA. A dApp's `wallet_sendCalls` first delegates it to Kernel, and it stays smart. |
| **Plain** | As an EOA, one transaction per call. Never upgraded. |

To switch, use the button under the account's mode on the Account home: **Switch to smart** for a plain account, **Revoke delegation** for a Kernel account (it becomes Plain (upgradable)), or **Switch to Kernel** for an account delegated somewhere else. The Plain modes are under **Advanced**. A change that clears a delegation asks first.

DevWallet never touches contract code, and leaves an account delegated somewhere else as it is until you switch it. An impersonated account keeps its own code: it is smart only if it already delegates to Kernel. It can't sign a user operation, so it always pays its own gas.

### What DevWallet writes to your chain

DevWallet keeps the node in step with the modes. It checks a network when the Account home opens on one it hasn't checked yet, when you change a mode, before it answers a connected dApp's account requests and EIP-5792 reads, and before it previews or sends anything. Each time, it:

- installs the account-abstraction contracts at any of these addresses that has no code, with `anvil_setCode` (`hardhat_setCode` on Hardhat):

  | Contract | Address |
  |---|---|
  | EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
  | EntryPoint's SenderCreator | `0xEFC2c1444eBCC4Db75e7613d20C6a62fF67A167C` |
  | Kernel v3.3 | `0xd6CEDDe84be40893d153Be9d467CD6aD37875b28` |
  | DevWallet paymaster | `0x281D3b7F84120F81CD8D11CC95926663245c2765` |

  If one of them holds other code, DevWallet installs nothing and smart accounts are off on that network. The Account home says so.
- delegates each smart account that has no code: it sets the code to the EIP-7702 delegation `0xef0100` + Kernel's address, also with `setCode` (not a type-4 transaction);
- clears the Kernel delegation of an account you set to a Plain mode.

The contracts are installed whatever the accounts' modes. Impersonated accounts are only changed when you pick a mode for them.

Sponsored sends also write to the chain (see below).

### Gas sponsor

**Settings → Gas sponsor** picks who pays a smart account's gas:

- **DevWallet sponsor** (the default): the calls go out as an ERC-4337 v0.7 user operation. DevWallet's paymaster pays, and the sponsor account `0xA346eBFABDf8D996e8c050431bb1F3E6221c45F3` submits it (`handleOps`). DevWallet impersonates the sponsor, tops it up to 1,000 ETH when it falls under 10 ETH, and has it deposit 10 ETH for the paymaster in the EntryPoint when that deposit falls under 1 ETH.
- **An account** of the network: the same, but that account submits and pays from its own ETH. It needs 0.1 ETH, or 10.1 ETH when the paymaster's deposit needs topping up.
- **Off**: the smart account sends its batch to itself and pays its own gas.

When sponsoring isn't possible (an impersonated account, a sponsor account short of ETH), the account sends to itself instead, and the approval shows who pays and why. A batch the wallet expects to revert is never sponsored: a `handleOps` receipt succeeds even when its operation fails, so it would hide the failure.

An `eth_sendTransaction` from a smart account returns the hash of the transaction that carried it. For a sponsored call that is the `handleOps` transaction, sent from the sponsor. The dApp's `gas`, fee and `nonce` fields are ignored. Plain accounts send as they always did.

### EIP-5792 v2

DevWallet answers `wallet_*` batch requests itself, per [EIP-5792](https://eips.ethereum.org/EIPS/eip-5792) v2:

- `wallet_getCapabilities` reports only `atomic`, for the wallet's chain (`0x7a69` on a default node). Its status is `supported` for a Kernel account, `ready` for a Plain (upgradable) EOA, and `unsupported` otherwise.
- `wallet_sendCalls` takes `version: "2.0.0"`, `chainId` (hex), `calls`, `atomicRequired`, and optionally `from` (the active account by default) and `id`. A smart account runs the calls as one atomic batch. A Plain (upgradable) account is upgraded first. Other accounts send one transaction per call, or fail with `5760` when `atomicRequired` is `true`. A contract deployment (a call without `to`) must be sent alone.
- `wallet_getCallsStatus` returns `100` (pending), `200` (success), `500` (reverted) or `600` (partially reverted), with one receipt per transaction. For a user operation, that is the `handleOps` receipt, with the operation's own outcome and logs.
- `wallet_showCallsStatus` opens the batch's transaction in the side panel.

When the wallet expects a batch to revert, its approval says so, and **Sign anyway** sends it to revert on chain. With **Bypass Transaction Authorization** on, nobody is asked, so it is refused with code `3` and the revert data. The test dApp that `bun run dev` serves has buttons for all four methods.

### The batch queue

The batch queue collects a dApp's separate sends and signs them as one transaction:

1. Open a batch with **Start batch** on the Account home, or pick **Add to batch** on a send's approval.
2. While it is open, approve that account's sends with **Add to batch**. With **Bypass Transaction Authorization** on, they join on their own.
3. **Review** opens the batch. Reorder or remove requests and see the whole batch simulated, then **Sign batch**. Each dApp request is then answered: an `eth_sendTransaction` with the transaction's hash, a `wallet_sendCalls` with its batch id.

**Discard** rejects the waiting requests with `4001`, and so does switching networks. Removing a request rejects just that one. Only smart accounts batch, and contract deployments never join. One batch is open at a time, for one account on the active network. If the batch changes after you review it, signing is refused until you review it again. A dApp that waits for a receipt before its next request waits until the batch is signed.

### Known limitations

- If the extension's service worker restarts while requests wait in a batch, the batch closes, but those requests are never answered: the dApp waits until you reload it. DevWallet keeps the worker alive while anything waits, so this only happens on a crash, an extension reload or a browser restart.
- DevWallet notices that the node was reset only while its service worker runs, when the block number goes down. After a reset it missed, `wallet_getCallsStatus` still knows the old chain's batch ids and reports them as pending. The contracts and delegations are set up again on the next check either way.

### Hardhat

Smart accounts, user operations and EIP-5792 batches work on a Hardhat 3 node (`npx hardhat node`) too. DevWallet uses Hardhat's `hardhat_*` cheat methods. There are two differences from Anvil:

- **Previews are thinner.** Hardhat has no `eth_simulateV1`, so previews fall back to `eth_call`. They show no gas cost and no balance changes, only whether the batch reverts. In a non-atomic batch, only a revert of the first call is caught. For a Plain (upgradable) account, the preview can't predict a revert before the upgrade: the batch is still refused, but only after the account is upgraded.
- **Sign anyway reports an error.** By default Hardhat answers a reverted transaction with an error, though it mines it. The dApp then gets code `3` instead of a hash or a batch id, and a batch you signed stays open. To get Anvil's behaviour, set `throwOnTransactionFailures: false` on the network `npx hardhat node` uses:

  ```ts
  // hardhat.config.ts
  export default defineConfig({
    networks: {
      node: { type: 'edr-simulated', throwOnTransactionFailures: false },
    },
  })
  ```

### Regenerating the account-abstraction bytecode

The bytecode DevWallet installs is committed in `src/smart/aa-code.generated.ts`, so the wallet needs no network for it. Run `bun run aa:generate` only after you change `contracts/src/DevWalletPaymaster.sol`, or the contract addresses in `src/smart/constants.ts`. It needs [Foundry](https://book.getfoundry.sh/) and network access. It builds `contracts/` with `forge`, then fetches the EntryPoint, SenderCreator and Kernel code from Ethereum mainnet (`MAINNET_RPC_URL` overrides the RPC), and a Kernel build from Arbitrum Sepolia for the tests (`ARBITRUM_SEPOLIA_RPC_URL`). It rewrites `src/smart/aa-code.generated.ts` and `src/smart/testing/kernel-arbitrum-sepolia.generated.ts`. A chain that already holds the old paymaster then counts it as unknown code, so restart that chain.

## Contributing

If you're interested in contributing, please read the [contributing docs](/.github/CONTRIBUTING.md) **before submitting a pull request**.

## DevWallet Authors
- [@sideris](https://github.com/sideris) (PGSideris, [Twitter](https://twitter.com/PGSideris))

## Rivet Authors

- [@jxom](https://github.com/jxom) (jxom.eth, [Twitter](https://twitter.com/_jxom))
- [@tmm](https://github.com/tmm) (awkweb.eth, [Twitter](https://twitter.com/awkweb))

## License

[MIT](/LICENSE) License
