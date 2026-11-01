# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

DevWallet is a Chromium MV3 browser extension. Its UI is a React web app that runs in Chrome's side panel (`src/entries/iframe/index.html`), so it follows web design conventions, not native ones. Firefox support is planned but has not shipped.

## Users

DevWallet serves two primary audiences equally. Often they are the same person, switching between the two jobs in one session:

- **Contract developers** write Solidity against a local Anvil or Hardhat 3 node. They inspect and change chain state (accounts, balances, nonces, blocks, mining mode, snapshots and reverts, deployed contracts) while they iterate on their code.
- **dApp frontend developers** test wallet flows against that local node or a fork: connecting, signing messages and typed data, sending transactions, and impersonating any account on the network.

Both work in the browser with DevWallet open in the side panel next to the dApp or page they are building. Their editor, terminal and node run alongside it.

## Product Purpose

DevWallet is a developer wallet and DevTools for local Ethereum nodes, much like browser DevTools or React DevTools are for the web. It lets developers inspect, debug, modify and manipulate Ethereum state without leaving the browser. It also acts as a real injected wallet, so any dApp, production ones included, can be exercised from a node-attached or impersonated account.

Success means a developer keeps DevWallet open throughout a build session because it answers "what just happened on my chain?" and "put the chain in this state" faster than scripts, the console or block explorers can.

## Positioning

DevWallet is known for two things.

1. **Project-aware.** It imports deployed contracts and their ABIs straight from the developer's project on disk: Foundry `broadcast/` run logs plus `out/` artifacts, Hardhat 3 Ignition deployments (`ignition/deployments/chain-31337/`), and `hardhat-deploy` (`deployments/<network>/`). It also auto-discovers contracts deployed to the running node. Most dev wallets know only the chain; DevWallet also knows the code that was deployed to it.
2. **Smart-account testing.** A confirmed direction, still in progress on the `smart-accounts` branch. DevWallet is becoming the place to build and test smart accounts on a local node. The specific standards (for example EIP-7702 or ERC-4337) and their scope have not been decided yet.

DevWallet descends from Paradigm's Rivet, but being a maintained Rivet fork is background, not the headline.

## Operating Context

- **Side panel, narrow viewport.** The app lives in Chrome's side panel next to the page being developed. Layout must work at side-panel widths and full height. A fixed header (network and account context) sits above the routed content.
- **Local node on chain id `31337`**, the shared default of `anvil` and `npx hardhat node`. Viem cannot tell Anvil and Hardhat apart on that chain id, so the network is labelled "Localhost". Other RPC URLs and forks can also be configured.
- **Core surfaces:** onboarding (configure chains, install and run Anvil), the main tabs (Accounts, Contracts, TXs, Blocks), account, contract, block and transaction details, token transfer, block config, networks and network config, session (dApp connections), settings, and pending dApp requests. A pending request takes over the panel until it is resolved.
- **Offline node** is a routine state: when the RPC is unreachable, a blocking dialog appears everywhere except networks, session and settings.
- **Alongside consumer wallets.** DevWallet announces itself through EIP-6963 and does not overwrite `window.ethereum` when another wallet is present. When no other wallet is installed, it injects as `window.ethereum` for legacy dApps.
- **Developer rituals:** frequent resets and redeploys, impersonation, manual, interval or auto mining, snapshot and revert, copying addresses, hashes and calldata, and reading decoded ABI data and logs.
- **Light and dark themes**, toggled in Settings or with `Ctrl+Shift+Y`.

## Capabilities and Constraints

- **Shipped:** chain and block configuration; account listing, aliases, impersonation, and setting balances and nonces; ERC-20 token detection, import and transfer; infinite block and transaction lists, including pending ones; contract import from disk, auto-discovery and ABI upload; ABI read and write interaction; decoded calldata and logs; dApp connections with sending and signing; EIP-6963.
- **Planned (marked `*` in the README):** reset, deploy and switch instances; ERC-721 and ERC-1155 balances; private key and HD account import; time travel; storage and bytecode inspection and editing; deployment details; source view; transaction tracing, state diffs and filtering; mempool editing; "Instant Connect"; request modifiers; keyboard shortcuts; Firefox.
- **Smart accounts:** a confirmed direction with scope still open. Do not present smart-account features as shipped until they exist in code.
- **Technical stack (existing):** React 18, React Router 6, TanStack Query, zustand, viem (plus ethers in places), Radix primitives, and vanilla-extract with an in-house design system in `src/design-system` (Box, Stack, Inline, Columns, Text, Button, Input, and others; sprinkles-based tokens). Bun is the package manager and test runner, Vite builds, and `web-ext` loads the extension in dev.
- **Terminology:** DevWallet (one word, capital D and W); Anvil; Hardhat 3; Foundry; "impersonate"; "TXs" as the tab label.
- **Contributor-first.** The project aims to be friendly to open-source contributors. The design system and patterns should stay legible to outside contributors.

## Brand Commitments

- **Name:** DevWallet is its own product brand.
- **obolos:** "by obolos" is attribution only. It currently appears in the Settings footer with the obolos mark (`public/obolos-logo.png` in light theme, `public/logo-white.png` in dark) and links to the `equitylayer` GitHub org. obolos does not drive DevWallet's identity.
- **Rivet attribution:** DevWallet is forked from Paradigm's Rivet under MIT. The original license and the credit to the Rivet authors must be retained.
- **Existing marks:** `public/icons/devwallet-logo.svg`, the generated extension icons (`public/icons/icon@*.png`, with `-dev` variants for dev builds), and the `DWLogo`, `DevWalletIcon` and `BrandIcon` components in `src/components/svgs/`.
- **Voice in the product today:** plain, technical, developer-to-developer. The tagline is "Developer Wallet & DevTools for Anvil & Hardhat designed to supercharge your Ethereum development workflow."

## Evidence on Hand

- `README.md` lists features, shipped and planned, plus setup steps and the EIP-6963 behaviour.
- `.github/CONTRIBUTING.md` describes the four extension contexts and the messenger architecture. Diagrams: `.github/assets/interface-diagram-*.png` and `messaging-*.png`.
- Chrome Web Store listing: `chromewebstore.google.com/detail/emajibkjkkilgdahffjhapcljjhhdpeb`.
- There is a test dApp for exercising wallet flows (`test/dapp/`) and test contracts (`test/contracts/`).
- **Absent:** no user counts, testimonials, case studies, benchmarks or press exist in the repo. Do not fabricate them. There is no smart-account implementation yet.

## Product Principles

1. **State at a glance, change in a click.** Every screen should answer "what is the chain doing?" and offer the obvious way to change it. Inspection and manipulation sit side by side.
2. **Know the project, not just the chain.** Use the developer's own artifacts (ABIs, deployment records, names) so data appears decoded and labelled, not as raw hex.
3. **Serve both hats.** Contract work and frontend wallet testing are equal first-class jobs. Neither should be buried behind the other.
4. **A companion, not a destination.** DevWallet lives next to the page being built and coexists with real wallets. It must stay fast, compact and out of the way until it is needed.
5. **Honest about the node.** Show offline, pending and impersonated states plainly, and never imply something happened on chain when it did not.
