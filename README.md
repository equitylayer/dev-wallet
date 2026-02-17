<p align="center"><strong>Developer wallet & DevTools for Anvil</strong></p>

<div align="center">

[//]: # (  <a href="https://chrome.google.com/webstore/detail/rivet/mobmnpcacgadhkjfelhpemphmmnggnod">)

[//]: # (    <img alt="Chrome Web Store Version" src="https://img.shields.io/chrome-web-store/v/mobmnpcacgadhkjfelhpemphmmnggnod">)

[//]: # (  </a>)
  <a href="https://github.com/D01-DayOne/dev-wallet/actions/workflows/on-push-to-master.yml">
    <img alt="GitHub Workflow Status" src="https://img.shields.io/github/actions/workflow/status/D01-DayOne/dev-wallet/on-push-to-master.yml">
  </a>
  <a href="https://github.com/D01-DayOne/dev-wallet/blob/main/LICENSE">
    <img alt="GitHub" src="https://img.shields.io/github/license/D01-DayOne/dev-wallet">
  </a>
</div>

Forked and modified from [Rivet](https://github.com/paradigmxyz/rivet) (MIT licensed) by Paradigm. Original license retained.

## What is DevWallet?

DevWallet is a developer Wallet & DevTools for Anvil (akin to [Browser DevTools](https://developer.mozilla.org/en-US/docs/Learn/Common_questions/Tools_and_setup/What_are_browser_developer_tools#how_to_open_the_devtools_in_your_browser) or [React DevTools](https://react.dev/learn/react-developer-tools)). It is a browser extension that enables developers to inspect, debug, modify, and manipulate the state of Ethereum: accounts, blocks, contracts & the node itself. DevWallet is also compatible with any production dApp, meaning you can simulate any type of action from either an Account attached on the Anvil instance, or by "impersonating" another Account on the network.

By integrating [EIP-6963: Multi Injected Provider Discovery](https://eips.ethereum.org/EIPS/eip-6963), DevWallet is designed to be used alongside and with other consumer browser wallets like MetaMask or Rainbow to provide more engrained developer tooling and workflows for Ethereum.

DevWallet is aimed to be **contributor first & friendly**. If you would like to contribute, check out the [Contributing Guide](/.github/CONTRIBUTING.md).

## Why was it forked?

Development had slowed down and many issues were left open.

Rivet is still the best dev tool that works well in the development flow of use


## Download

- **Chromium (Chrome, Brave, Arc, etc)** [[Download]](https://chromewebstore.google.com/detail/emajibkjkkilgdahffjhapcljjhhdpeb?utm_source=item-share-cb)
- **Firefox**: coming soon
- **Safari**: coming soon

### Nightly Release

DevWallet is currently in active development. If you would like to try out the latest features, you can download the latest nightly build below:

- **Chromium (Chrome, Brave, Arc, etc)**: [Download](https://github.com/D01-DayOne/dev-wallet/releases/latest)

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
- **Block**
  - Infinite scroll through previous blocks
  - View block details & transactions
  - Toggle between "click-to-mine", interval mining, and auto-mining
  - Time-travelling (rewind & replay)*
- **Contract**
  - Read & write interactions with intuitive UI to represent ABI data structures*
  - Inspect & set storage slots*
  - Inspect & set bytecode*
  - Deployment details (compiler version, optimization + runs)*
  - Inspect contract source code*
- **Transaction**
  - Infinite scroll through previous & pending transactions
  - View transaction details (including decoded calldata*, logs*, state*, and tracing*)
  - Filter transactions by block, account, and status*
  - Update transactions in Anvil mempool*
- **Dapp Connections**
  - Connect to Dapps with your Anvil (and impersonated) account(s)
  - Send transactions, sign messages & typed data, etc
  - Account authorization & "Instant Connect" mode*
  - Transaction request modifiers (fees, nonce, etc)*
- **Other**
  - EIP-6963: Multiple Injected Provider Discovery
  - Light & Dark Mode
  - Keyboard shortcuts*

\* = Planned feature

## Getting Started

### 1. Clone the repository

Clone the repo to your local machine using git:

```bash
git clone https://github.com/D01-DayOne/dev-wallet.git
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

## Multi-Wallet Support

DevWallet supports both legacy `window.ethereum` injection and modern [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963) multi-wallet discovery.

**EIP-6963 Support:**
- DevWallet announces itself via EIP-6963, allowing dapps to discover it alongside other wallets
- If another wallet (MetaMask, Coinbase, etc.) is already installed, DevWallet will NOT overwrite `window.ethereum` to avoid conflicts
- Dapps that support EIP-6963 can present users with a wallet selector to choose between DevWallet and other installed wallets
- The test dapp (`bun run dapp`) demonstrates EIP-6963 wallet discovery

**Legacy Dapp Compatibility:**
- If no other wallet is present, DevWallet will inject itself as `window.ethereum` for compatibility with older dapps
- For testing legacy dapps, run DevWallet in its own Chrome profile without other wallets installed

Helpful note: A fresh Chrome profile gets instantiated when running the dev script: `bun run dev`.

## Contributing

If you're interested in contributing, please read the [contributing docs](/.github/CONTRIBUTING.md) **before submitting a pull request**.

## DevWallet Authors
- [@sideris](https://github.com/sideris) (PGSideris, [Twitter](https://twitter.com/PGSideris))

## Rivet Authors

- [@jxom](https://github.com/jxom) (jxom.eth, [Twitter](https://twitter.com/_jxom))
- [@tmm](https://github.com/tmm) (awkweb.eth, [Twitter](https://twitter.com/awkweb))

## License

[MIT](/LICENSE) License
