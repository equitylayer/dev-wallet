---
version: 1
slug: "src-screens-index-tsx"
primary_target: "src/screens/index.tsx"
related_targets: ["src/screens/_layout.tsx","src/components/shell/AccountStrip.tsx","src/components/shell/StatusLine.tsx","src/screens/account-home/index.tsx"]
---

# Surface brief: DevWallet shell and Account home

Mode: Operate. Scope: the app shell (account strip, bottom nav, status line, offline banner) and the Account home. Later rounds on this brief: first run (onboarding, networks), dApp requests (connect, sign, send, wallet_sendCalls, sessions), inspection (contracts by deployment run, activity ledger by block, tx and block details). Chain-control screens (account details, tokens, transfer, block config, settings) get a restyle only, with flows unchanged.

Audience and job: contract and dApp frontend developers, glancing at the side panel (320–480px) between keystrokes. They need to know which account they're acting as and what kind it is, what just happened, and what's waiting.

Confirmed decisions (2026-11-01):
- Structure: Account desk, plus a quick-switch strip of recent accounts that stays visible on every screen.
- Node offline: a red status line and an inline banner instead of the blocking dialog; read-only inspection stays usable.
- Smart-account data (mode, Kernel delegation, sponsor, EntryPoint nonce): design the slots now, but render nothing until engineering stores the data (see docs/superpowers/specs/2026-11-01-smart-accounts-design.md §1, §10). Never claim a mode the store doesn't have.
- Batching ("Add to batch", queue, review) is owned by the smart-accounts work. This surface only reserves the slot under the account actions.
- Type scale steps up to 13/12/11px. Units moved from 10px to 11px after the detector flagged them, so the floor is a flat 11px.
- Comp: `.impeccable/mocks/comp/account-home.html` (2026-11-01; mocks are kept locally and gitignored) refines the chosen `.impeccable/mocks/decision/account-desk.html` sketch. The user didn't review it before the build ("judt do it. if we dont like it we do later"), so it is the working reference, not a user-approved comp.
- Build adaptations, after the finish review (2026-11-01):
  - No label above the alias: eyebrows are banned by the craft floor.
  - With no alias, the title slot reads "Add alias" (tertiary) instead of repeating the address.
  - The third readout is Code (None / 7702 / Contract, read from the node) instead of Impersonated, which the tag already shows.
  - Settings and an icon-only Mine (the incumbent pickaxe) sit in the status line, so the strip keeps its width for account chips.
  - Below a 380px container the mining-mode word hides; it stays in the block link's title.

Untouched: background, inpage, messengers, EIP-6963 behavior, data hooks.

Open: which keyboard shortcut cycles accounts; how many accounts fit the strip at 320px (overflow goes to "All accounts").

## Direction contract

THESIS: The panel is about who you are acting as. It refuses the category default of chain-state header plus four equal tabs, and the consumer-wallet hero balance card.

OWN-WORLD: Terminal Sidecar. Raised canvas (#fdfcfb / #191a1c), 1px hairlines, square corners. Inter for people, IBM Plex Mono with tabular numerals for the chain. Prompt Teal or Phosphor Amber marks only the active account, active tab and focus. Signals are hue only.

STORY: Glance: see the alias, address, mode and balance, plus whether the node is healthy. Switch: one tap on the strip. Act: Send, Edit state, Impersonate. Drill down: Contracts, Activity, Blocks from the bottom bar.

FIRST VIEWPORT: Top, the account strip (recent aliases, active marked in accent, "All" at the end). Below it, the account plate: label and mode tag, alias at 20px, full address in mono with copy, mode and delegation line (only when data exists), a readout row (balance, nonce, impersonated), then actions (Send primary, Edit state, Impersonate). Then the batch slot, Tokens, Connected, Recent activity. Bottom: nav bar (Account, Contracts, Activity, Blocks) over the status line (dot, RPC, chain, block, mining mode, Mine). The primary action is Send, in the plate.

FORM: Account desk, position 7 of 7 on the ordered list, seed:5b2bd159754588e6.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
