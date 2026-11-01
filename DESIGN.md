---
name: DevWallet
description: Developer wallet and DevTools for local Ethereum nodes, docked in Chrome's side panel.
colors:
  warm-paper: "#f9f7f4"
  warm-paper-raised: "#fdfcfb"
  warm-paper-recess: "#f3f2ee"
  paper-fill: "#e8e5e0"
  paper-fill-soft: "#ede9e4"
  paper-fill-faint: "#f5f3f0"
  paper-fill-whisper: "#faf9f7"
  ink: "#2a2520"
  ink-secondary: "#5a5550"
  ink-tertiary: "#7a7570"
  ink-quaternary: "#9a9590"
  paper-rule: "#dcd9d4"
  paper-rule-faint: "#ebe8e3"
  terminal-black: "#000000"
  terminal-raised: "#191a1c"
  terminal-recess: "#1b1c1e"
  terminal-recess-raised: "#222324"
  terminal-fill: "#44474b"
  terminal-fill-soft: "#3e3f43"
  terminal-fill-faint: "#2e2f30"
  terminal-fill-whisper: "#212224"
  glyph: "#ffffff"
  glyph-secondary: "#c2c5cb"
  glyph-tertiary: "#9a9ba1"
  glyph-quaternary: "#78797e"
  terminal-rule: "#3c3f43"
  terminal-rule-faint: "#2b2c2f"
  prompt-teal: "#00717f"
  prompt-teal-wash: "#e3eff0"
  phosphor-amber: "#f9b64f"
  phosphor-amber-wash: "#2c2416"
  on-amber: "#1d1407"
  signal-blue: "#3374f4"
  signal-blue-dark: "#3898fe"
  signal-blue-tint: "#d6e4f1"
  signal-blue-tint-dark: "#0f3058"
  signal-green: "#2a9764"
  signal-green-dark: "#30a46c"
  signal-green-tint: "#ddf3e4"
  signal-green-tint-dark: "#123929"
  signal-red: "#dc3d43"
  signal-red-dark: "#f2555a"
  signal-red-tint: "#ffe5e4"
  signal-red-tint-dark: "#541b1e"
  signal-yellow: "#f9d24a"
  signal-yellow-dark: "#ffdf3c"
  signal-yellow-tint: "#fff8bb"
  signal-yellow-tint-dark: "#3e3000"
typography:
  display:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "32px"
    fontWeight: 500
    lineHeight: "40px"
    letterSpacing: "-0.6px"
  headline:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "22px"
    fontWeight: 500
    lineHeight: "28px"
    letterSpacing: "-0.4px"
  title-large:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: "25px"
    letterSpacing: "-0.3px"
  title:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: "21px"
    letterSpacing: "-0.1px"
  body-large:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "20px"
    letterSpacing: "-0.1px"
  body-prose:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
    letterSpacing: "0px"
  body:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "17px"
    letterSpacing: "0px"
  caption:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
    letterSpacing: "0.1px"
  label:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "15px"
    letterSpacing: "0.1px"
  data-readout:
    fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
    letterSpacing: "0px"
    fontFeature: "'tnum' 1"
  data:
    fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "17px"
    letterSpacing: "0px"
    fontFeature: "'tnum' 1"
  data-small:
    fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
    letterSpacing: "0px"
    fontFeature: "'tnum' 1"
rounded:
  none: "0px"
  knob: "2px"
  track: "4px"
  round: "9999px"
spacing:
  2px: "2px"
  4px: "4px"
  6px: "6px"
  8px: "8px"
  10px: "10px"
  12px: "12px"
  16px: "16px"
  20px: "20px"
  24px: "24px"
  32px: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.warm-paper-raised}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "28px"
  button-primary-dark:
    backgroundColor: "{colors.glyph}"
    textColor: "{colors.terminal-black}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "28px"
  button-stroked:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "28px"
  button-primary-large:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.warm-paper-raised}"
    typography: "{typography.body-large}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "36px"
  button-compact-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.none}"
    padding: "0 8px"
    height: "24px"
  button-compact-stroked:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.none}"
    padding: "0 8px"
    height: "24px"
  button-destructive-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.signal-red}"
    typography: "{typography.caption}"
    rounded: "{rounded.none}"
    padding: "0 8px"
    height: "24px"
  input:
    backgroundColor: "{colors.warm-paper-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body-large}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "36px"
  input-compact:
    backgroundColor: "{colors.warm-paper-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.data-small}"
    rounded: "{rounded.none}"
    padding: "0 6px"
    height: "24px"
  input-filter:
    backgroundColor: "{colors.warm-paper-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 8px"
    height: "28px"
  account-switcher:
    backgroundColor: "{colors.warm-paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "40px"
  account-switcher-open:
    backgroundColor: "{colors.warm-paper-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "40px"
  account-switcher-list:
    backgroundColor: "{colors.warm-paper-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
  account-option:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "36px"
  account-option-highlighted:
    backgroundColor: "{colors.paper-fill-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "36px"
  account-option-active:
    backgroundColor: "{colors.prompt-teal-wash}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "36px"
  nav-item:
    backgroundColor: "{colors.warm-paper}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    height: "36px"
  nav-item-active:
    backgroundColor: "{colors.warm-paper-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    height: "36px"
  status-line:
    backgroundColor: "{colors.warm-paper}"
    textColor: "{colors.ink}"
    typography: "{typography.data-small}"
    rounded: "{rounded.none}"
    padding: "0 4px 0 0"
    height: "32px"
  offline-banner:
    backgroundColor: "{colors.signal-red-tint}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.none}"
    padding: "10px 12px"
  readout-label:
    textColor: "{colors.ink-tertiary}"
    typography: "{typography.label}"
  account-row-active:
    backgroundColor: "{colors.prompt-teal-wash}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink-tertiary}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
  tab-active:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
  tag:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "2px 6px"
  toast:
    backgroundColor: "{colors.warm-paper-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "8px"
---

# Design System: DevWallet

## Overview

**Creative North Star: "The Terminal Sidecar"**

DevWallet is a terminal pane docked beside the browser. It sits in Chrome's side panel next to the dApp being built and reads like an instrument the developer glances at between keystrokes. Readouts are dense, every edge is hard, and color appears only when the chain has something to say. The panel is a narrow column of hairline-ruled cells framed by two ground-colored bands: an account switcher across the top, and the section nav over a one-line node status at the bottom. Between them, on the raised canvas, sit the screen's plate and its lists of rows. Hierarchy comes from type size, ink weight and tonal steps between surfaces. It never comes from cards, shadows or ornament. The exception is the single layer that floats over content, the account switcher's list, which casts one soft shadow.

There are two grounds and they are not mirror images. **Warm Paper** (light) is an unbleached off-white with warm grey-brown ink, a lab notebook on the bench. **Terminal Black** (dark) is pure black under a near-black working canvas with cool grey glyphs, the classic terminal. Each theme has exactly one accent: **Prompt Teal** on paper, taken from the cyan end of the logo's prompt glyph, and **Phosphor Amber** on black, after amber-phosphor CRTs. The accent marks what is active, selected or focused, and nothing else.

Type is split by who wrote the words. Humans get Inter: labels, headings, buttons, prose. Machines get IBM Plex Mono with tabular numerals: addresses, hashes, balances, block numbers, RPC URLs, calldata, ABI signatures. This pairing matches the obolos dApp's sans-serif faces. DevWallet does not use obolos's serif or script faces.

Confirmed anti-references: DevWallet never looks like a **consumer crypto wallet** (rounded balance cards, gradients, glassy surfaces, hero coin numbers), a **generic SaaS dashboard** (card grids, soft drop shadows, pill badges, big rounded buttons), or **sci-fi HUD kitsch** (neon glow, scanlines, glitch effects, display fonts like Orbitron).

**Key Characteristics:**
- Narrow, dense, column-first. It is designed for the side panel, not the page, and no functional text is set below 11px.
- Square corners everywhere. Circles appear only on status dots.
- 1px hairlines and tonal steps instead of shadows. Only a floating layer casts one.
- Inter for people, IBM Plex Mono for the machine.
- Monochrome base. Hue means state (signal) or focus (accent), never decoration.
- One accent per theme: Prompt Teal on Warm Paper, Phosphor Amber on Terminal Black.

## Colors

The palette is a monochrome base of ink on paper (light) or glyph on black (dark), with four signal hues and one accent per theme.

### Primary
- **Prompt Teal** (#00717f): the light-theme accent, in code as `text/accent/active` and `surface/accent`. It marks the open account switcher and the active nav item (a 1.5px rule), the active in-screen tab, the check on the active account in the switcher list, toggles that are on, focus outlines and focused input borders, the text caret, and the selection highlight (at 0.28 alpha). It reaches 5.6:1 on the raised paper canvas. White text sits on a teal fill.
- **Prompt Teal Wash** (#e3eff0): `surface/fill/devwallet/active`. The flat background of the selected row in a list (the active account in the switcher list and in All accounts, the active network).
- **Phosphor Amber** (#f9b64f): the dark-theme accent, with the same roles as Prompt Teal. It reaches 9.8:1 on the raised terminal canvas. Text and the toggle knob on an amber fill are near-black **On Amber** (#1d1407).
- **Phosphor Amber Wash** (#2c2416): the dark-theme selected-row background.

### Neutral (light: Warm Paper)
- **Warm Paper** (#f9f7f4): the page ground (`surface/primary`). The account switcher bar, bottom nav and status line sit on it.
- **Raised Paper** (#fdfcfb): the panel canvas the screens render on (`surface/primary/elevated`), plus the open switcher and the active nav item, the switcher's list, input fields and toasts.
- **Paper Recess** (#f3f2ee): secondary grounds and sunken regions (`surface/secondary`).
- **Paper Fills** (#e8e5e0 / #ede9e4 / #f5f3f0 / #faf9f7): fills from strongest to faintest. The strongest is the stroked-button border and the off toggle track. The second (`surface/fill/secondary`) is the keyboard and hover highlight on switcher list rows. The faintest (`surface/fill/quarternary`) is the hover wash on the switcher bar, nav items, status-line links and rows, and the account row's drawer pull.
- **Ink** (#2a2520): primary text, and the fill of the primary button.
- **Ink Secondary / Tertiary / Quaternary** (#5a5550 / #7a7570 / #9a9590): resting nav items, addresses, metadata and switcher balances; then readout labels, shortcut digits, placeholders and row icons; then disabled text.
- **Paper Rule** (#dcd9d4) and **Faint Rule** (#ebe8e3): the paper rule bounds the bands, the plate, section headers, readout dividers and tag borders. The faint rule separates rows and nav cells, the bar's home cell, and the switcher list's filter and footer.

### Neutral (dark: Terminal Black)
- **Terminal Black** (#000000): the page ground (`surface/primary`), under the switcher bar, nav and status line.
- **Terminal Raised** (#191a1c): the panel canvas the screens render on (`surface/primary/elevated`), and the open switcher and active nav item.
- **Terminal Recess** (#1b1c1e) and **Recess Raised** (#222324): secondary grounds.
- **Terminal Fills** (#44474b / #3e3f43 / #2e2f30 / #212224): fills from strongest to faintest, in the same roles as the paper fills.
- **Glyph** (#ffffff): primary text, and the fill of the primary button.
- **Glyph Secondary / Tertiary / Quaternary** (#c2c5cb / #9a9ba1 / #78797e): supporting text tiers.
- **Terminal Rule** (#3c3f43) and **Faint Rule** (#2b2c2f): hairlines and separators.

### Signals
Each signal has a solid value and a tint, with separate values per theme. The tint carries its own text color: blue #0165d1 / #4fa1f2, green #2a9764 / #8cdeb7, red #dc3d43 / #ffb2b5, yellow #ae8b3a / #efc000.
- **Signal Green** (#2a9764 / dark #30a46c): node online (the status dot), success toasts, and the Sponsored tag.
- **Signal Red** (#dc3d43 / dark #f2555a): node offline (dot, host text, "Offline" in the status line, the offline banner's icon, border and action), errors, invalid inputs, destructive buttons.
- **Signal Yellow** (#f9d24a / dark #ffdf3c): warnings and inputs in a warning state.
- **Signal Blue** (#3374f4 / dark #3898fe): informational emphasis and blue button variants.

### Named Rules
**The Signal-Only Rule.** Hue means state. Green is online or success, red is offline, error or destructive, yellow is warning, blue is information. Everything else is ink on paper or glyph on black.

**The Two Inks Rule.** Each theme has exactly one accent: Prompt Teal on Warm Paper, Phosphor Amber on Terminal Black. Never use one theme's accent in the other theme. The accent marks active, selected and focused things only. It is never a button fill for a call to action, and never a status color.

**The Amber Is Not a Warning Rule.** Phosphor Amber sits near Signal Yellow on Terminal Black. Never use amber for a warning. A warning always pairs the yellow tint with an icon or a text label, so it never relies on hue alone.

## Typography

**UI Font:** Inter (with system-ui, -apple-system, BlinkMacSystemFont, Segoe UI)
**Data Font:** IBM Plex Mono (with ui-monospace, Menlo)

**Character:** A neutral, highly legible grotesque for everything a person reads, beside a squared-off mono with a technical feel for everything the chain emits. In use the panel reads like a terminal with good labels.

Both faces ship with the extension. `src/design-system/styles/fonts.ts` imports the fontsource CSS for Inter 400, 500 and 600 and IBM Plex Mono 400 and 500. It is a plain module because vanilla-extract drops side-effect CSS imports from `.css.ts` files. The `mono`, `address` and `numeric` families all resolve to IBM Plex Mono. Capsize trims every block of text with Inter's metrics (`@capsizecss/metrics/inter`), so a text box's edges are its cap height and baseline.

### Hierarchy
- **Display** (500, 32px, 40px): the DevWallet wordmark on the onboarding start screen. Used nowhere else.
- **Headline** (500, 22px, 28px): rare section headings in onboarding and playgrounds.
- **Title Large** (500, 20px, 25px): the account alias on the account plate, or "Add alias" in tertiary ink when there is none.
- **Title** (500, 16px, 21px): screen titles in the container header and section heads on detail screens.
- **Body Large** (400, 15px, 20px): button labels and input text at 36px height. It is also the `Text` default size.
- **Body Prose** (400, 14px, 20px): onboarding instructions and explanatory sentences.
- **Body** (400, 13px, 17px): the workhorse. Bottom nav labels, 28px button labels, the account alias in the switcher bar and list in medium, the switcher's filter text, row titles in medium, section headers in medium, and the offline banner's title in semibold.
- **Caption** (400, 12px, 16px): row metadata, the switcher list's note, footer link and hint, section-header actions, empty states, 24px button labels and status-line words.
- **Label** (400, 11px, 15px, sentence case): readout labels (Balance, Nonce, Code), units beside a number (ETH), tags (Impersonated, This tab, Sponsored, in medium) and character counts. Readout labels are always tertiary ink. The switcher's shortcut digits (1–9, 0) take the same 11px in IBM Plex Mono, tertiary.
- **Data Readout** (IBM Plex Mono 400, 14px, 20px, tabular): the plate's Balance and Nonce values.
- **Data** (IBM Plex Mono 400, 13px, 17px, tabular): balances and amounts on the right of rows. From 1 ETH up a balance always shows two decimals (below 1, up to six), so balance columns line up.
- **Data Small** (IBM Plex Mono 400, 12px, 16px, tabular): the plate's full address, truncated addresses in the switcher and rows, balances in the switcher list (secondary ink), token names and contract addresses under a row title, the status line's RPC host, chain id and block number, and compact hex inputs.

Tracking is near zero to suit Inter: +0.1px at 11–12px, 0 at 13–14px, and negative from 15px up (-0.1px to -0.6px).

Weights stay in a tight range: regular for nearly everything, medium (500) for names, titles, tags and the Send label, semibold (600) only for an alert title. Light and heavy exist in the scale but carry no role.

### Named Rules
**The Data Wears Mono Rule.** If the chain produced it (an address, hash, number, token name, calldata, ABI type, RPC URL or block), it is set in IBM Plex Mono with tabular numerals. If a person wrote it (a label, alias, button or sentence), it is set in Inter.

**The Eleven-Pixel Floor Rule.** No text goes below 11px, units included. Readout labels are 11px sentence-case Inter in tertiary ink, placed above their value, so a label never competes with the reading under it. A unit sits beside its number at the same 11px, in tertiary ink.

## Layout

The app is one full-height column sized to Chrome's side panel. It must work from about 320px wide, and the design-system breakpoint is 480px. The shell, from top to bottom:

- **Account switcher bar** (40px, on the ground color, paper rule beneath). A 40px home cell holds the logo behind a faint rule. The rest of the bar is one button naming the active account: the alias in Body medium followed by the truncated address in tertiary Data Small, or the address alone in primary ink, with a mask icon when the account is impersonated and a 14px tertiary chevron at the right edge. It opens the account list as a popover under the bar. Digit keys 1–9 and 0 switch to the first ten accounts directly whenever the focus is not in a field.
- **Offline banner** (only when the node is unreachable, and not on the networks screen). An inline, non-blocking band under the switcher bar: red tint, 10px 12px padding, red-bordered bottom, a wifi-off icon in red, a 13px semibold title in the tint's text color, a 12px sentence that says the last known state is still showing, and a stroked red "Networks" action. Nothing is disabled by the banner itself.
- **Content** on the raised canvas, scrolling on its own.
- **Footer** (on the ground color, paper rule above). The bottom nav is four equal 36px cells (Account, Contracts, Activity, Blocks) divided by faint rules. Under it is the 32px status line: a status dot, the RPC host and chain id, a 14px divider, the block number and mining mode, then right-aligned tools (revert, an icon-only stroked Mine, settings). The status line is a container: under 380px its gaps tighten from 6px to 4px and the mining-mode word hides (it remains in the block link's title). When a dApp request is pending the nav hides and the status line stays.

The Account home is a plate followed by sections. The plate has 16px vertical and 12px horizontal padding and a paper rule beneath. Its rows are the identity row (alias or "Add alias", Impersonated tag, rename), the full address in mono with copy (6px below), the readout row (16px below), and the actions (16px below). Sections start 16px apart. Each has a 32px header with a 13px medium title, an optional action at the right, and a paper rule beneath. Rows are at least 48px tall with 8px 12px padding, a 10px gap and faint rules between them.

Spacing uses a 4px-based scale named in pixels. The common steps are 4px and 6px (inside controls and label pairs), 8px and 12px (gaps and the 12px horizontal gutter), and 16px (between plate rows and between sections), with 2px for tool clusters and 10px for row gaps. The larger steps (20–32px) appear only on onboarding. Density is deliberate: the panel shows as much chain state as it can while staying legible.

### Named Rules
**The Panel Width Rule.** Design at side-panel width first. Nothing scrolls horizontally except code and calldata. Long values truncate in the middle (`0x7099…79C8`) in lists, the switcher and rows. The plate is the one place that shows a full address; at widths too narrow for one line it may break, and it is never truncated.

**The Two Bands Rule.** Chrome lives in two ground-colored bands, the account switcher bar on top and the nav over the status line at the bottom. Screens never add a header strip of chain state; node state belongs to the status line.

## Elevation & Depth

The system is flat, with one floating layer. Depth comes from tonal layering: page ground, raised canvas, then fills. Structure comes from 1px hairlines. No resting surface casts a shadow. The shell bands sit on the ground and the content on the raised canvas, so the open switcher or an active nav item takes the raised color and reads as joined to the screen it governs. The account switcher's list is the one layer that floats over content: it sits on the raised canvas inside a paper-rule border and casts one soft offset shadow so it separates from the screen beneath. Shell controls and rows hover to the faintest fill. Design-system buttons hover with a per-surface filter (about 0.98 brightness on paper, about 0.85–0.95 contrast on black) and press with a 2% shrink (`scale(0.98)`). Apart from that layer, the one real shadow is on the toggle's knob, a 1px physical cue.

### Shadow Vocabulary
- **Floating layer** (`box-shadow: 0 14px 32px -12px rgb(0 0 0 / 0.5)`): only on a layer that floats over content, today the account switcher's list. It always pairs with a 1px paper-rule border.
- **Toggle knob** (`box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3)`): only on the sliding knob of the toggle.
- **Accent rule** (`box-shadow: inset 0 -1.5px 0 <accent>` on the open account switcher and the active in-screen tab; `inset 0 1.5px 0 <accent>` on the active nav item): a structural rule on the edge that faces the content. It is not depth.
- **Active-highlight ring** (`box-shadow: inset 0 0 0 1px <accent at 0.45>`): on a switcher list row that is both the active account and the keyboard or hover highlight, so the highlight still reads on the accent wash. It is not depth.
- **Focus outline** (`outline: 1.5px solid <accent>; outline-offset: -1.5px`): every `:focus-visible` element. Inputs drop the outline and take an accent border instead.

### Named Rules
**The Hairline Rule.** Separate with a 1px rule or a step in tone, never a shadow. If something seems to need a shadow, it is in the wrong layer.

**The Floating Layer Rule.** Only a layer that floats over content casts a depth shadow, and it is always the same one (`0 14px 32px -12px rgb(0 0 0 / 0.5)`) on top of a 1px paper-rule border. Today that is the account switcher's list. Nothing that rests in the column ever takes it.

**The Joined Tab Rule.** The open switcher or active nav item takes the raised canvas color and an accent rule on the edge facing the content. It never takes an accent fill.

## Shapes

Corners are square. Buttons, inputs, the switcher bar and its list, nav items, tabs, tags, rows, banners, dialogs and toasts all use a radius of 0 (the toaster explicitly sets `--border-radius: 0`). The only rounding is functional. Status dots and separator end caps are full circles (9999px). The toggle uses a softly squared 4px track and a 2px knob so it still reads as a physical switch. The logo tile, a rounded square with a dark teal-to-navy gradient holding a cream "D" and a mint-to-cyan prompt chevron, is the only rounded rectangle in the product. It is an identity asset, not a pattern to repeat.

Icons are Lucide outlines at a 1.75 stroke, 13–15px in the shell and rows, always in secondary or tertiary ink unless they carry a signal.

### Named Rules
**The Square Corner Rule.** If it is a surface or a control, its corners are square. A circle means a status. The logo is the only rounded rectangle.

## Components

### Buttons
Utilitarian and quiet: square, flat, and sized by the job.
- **Shape:** square (0px).
- **Sizes:** height and label go together. 16px (11px label, 4px padding), 18–20px (11px label, 6px padding), 24px (12px label, 8px padding), 28px (13px label, 12px padding, 14px icon), 36px (15px label, 12px padding), 44px (18px label, 16px padding). The 28px size is the action row on a plate.
- **Primary** (`solid invert`): ink on paper in light, white on black in dark. Reserve it for the single forward action on a screen (Send, Continue, Save).
- **Stroked** (`stroked fill`): transparent with a 1px strongest-fill border and a 5% ink wash on hover. Secondary actions beside the primary (Edit state, Impersonate, Cancel), and the icon-only Mine in the status line, which uses a paper-rule border.
- **Compact ghost** (`ghost primary`, 24px): transparent, with about a 5% ink wash on hover. Row and identity tools (copy, rename).
- **Signal variants:** ghost, stroked, solid and tint versions in red, green and blue. Destructive actions use ghost red or stroked red, and solid red only for a final confirmation.
- **Hover / Press:** per-surface brightness or contrast filter on hover, `scale(0.98)` on press, no color transition. Disabled buttons are 50% opacity with a not-allowed cursor. Shell tool buttons are 40% when disabled.
- **Focus:** the global 1.5px accent outline, inset by its own width.

### Chips
- **Tag:** a square 1px paper-rule border with 2px 6px padding and an 11px medium label in secondary ink (Impersonated, This tab). A signal tag swaps the border to the signal at 55% and the text to the signal (Sponsored, in green).

### Inputs / Fields
- **Style:** raised-canvas background, 1px border in ink at 20% (30% on hover), square corners, 36px default height (15px text, 12px padding), 28px for the switcher's filter (13px text, 8px padding), or 24px compact (11px text, 6px padding). Placeholders are tertiary ink. The caret is the accent.
- **Focus:** the border turns the accent (`surface/accent`) over 100ms; no outline and no ring.
- **Error / Warning / Disabled:** a red border for invalid or error, a yellow border for warning, and the recess background with no pointer events when disabled.
- **Hex and addresses** go in Data Small (IBM Plex Mono).

### Navigation
- **Bottom nav:** four equal 36px cells in Body, divided by faint rules. Inactive cells are secondary ink; hover is the faintest fill and primary ink over 120ms. The active cell is primary ink on the raised canvas with a 1.5px accent rule along its top edge. Detail routes light their owning section (an account or transfer lights Account; a transaction lights Activity), and the full accounts list belongs to Account.
- **Status line:** 32px, mono for the host, chain id and block number (12px, tabular) and Inter for words (12px). The host goes red when the node is offline and the block cell reads "Offline". Link cells hover to the faintest fill. Tools are 24px square icon buttons in secondary ink with a 2px gap.
- **Status dot:** an 8px circle that is green when listening, red when offline and ink at 50% while pending. It always sits beside the RPC host, never alone.
- **In-screen tabs:** equal-width text tabs in Body inside detail screens. Inactive tabs are tertiary ink. The active tab is primary ink with a 1.5px inset bottom rule in the accent. Switching is instant.

### Account Switcher
The global quick switch and the answer to "who am I acting as" on every screen. It is a bar and a list.
- **Bar:** the 40px ground band. The logo home cell (40px, faint rule on the right) leads to the Account home. The switcher button fills the rest with 12px padding and an 8px gap: alias in Body medium plus the truncated address in tertiary Data Small, or the address alone in primary ink, and a 14px tertiary chevron pushed right. Hover is the faintest fill over 120ms. Open, it takes the raised canvas and a 1.5px accent rule at its bottom edge, and the chevron turns 180° over 160ms.
- **List:** a popover 4px under the bar, inset 8px, its width the bar's minus 16px. Raised canvas, a 1px paper-rule border, square corners and the floating-layer shadow. It enters over 160ms (`cubic-bezier(0.16, 1, 0.3, 1)`), rising 4px from 0.4 opacity, and both the entrance and the chevron turn are off under `prefers-reduced-motion`.
- **Filter:** a 28px input in 8px padding with a faint rule beneath. Typing filters by address or alias. A pasted address or ENS name that is not already an account becomes an "Impersonate" row (mask icon, the value in Data Small) at the top of the list, with a 12px tertiary note under the list saying Enter adds it and switches to it.
- **Rows:** 36px tall, 0 10px padding, 10px gap, no rules between them, in a list of up to 360px (or 55% of the viewport) that scrolls vertically. Each row holds the shortcut digit (1–9, 0) in 11px tertiary mono, the account label, the balance right-aligned in 12px secondary mono with tabular numerals, and a 14px slot that holds an accent check on the active account. The active row takes the accent wash (`surface/fill/devwallet/active`). The keyboard or hover highlight takes the second fill (`surface/fill/secondary`). A row that is both adds a 1px inset accent ring at 0.45.
- **Footer:** a faint rule above, 8px 10px padding, the "All accounts" link in secondary Caption (primary and underlined on hover) and the tertiary hint "Arrow keys move, Enter switches" on the right, truncating when tight.
- **Keyboard:** arrow keys move the highlight and wrap, Enter switches, and the digit keys switch directly without opening the list.

### Account Plate (signature component)
The top of the Account home and the full answer to "who am I acting as". The identity row holds the alias at 20px medium (or "Add alias" in tertiary, which opens rename), an Impersonated tag, and a 24px ghost rename button pushed right. Under it the full address runs in Data Small secondary ink beside a 20px copy button. The readout row is a grid (1.5fr 1fr 1fr) of Balance, Nonce and Code. Each cell has an 11px tertiary label over a value whose bottom edge is its baseline: Data Readout for balance (with an 11px tertiary "ETH") and nonce, and Inter 14px for Code (None, 7702 or Contract). Cells after the first carry a paper-rule left divider with 12px padding on both sides. The actions are three equal 28px buttons with 6px gaps: Send (primary, with a send icon), Edit state, Impersonate. Edit state swaps the readouts for 24px inputs and Save / Cancel in place. The smart-account slot sits 12px under the address. Its first line is the mode label in Body ("Smart · Kernel v3.3", "Plain (upgradable)", "Plain", "Contract", or "Delegated to 0x5FbD…0aa3 (not Kernel)" with the target in mono and a 20px copy button). A Kernel account adds a 12px line, 6px below: "Delegates to" in tertiary ink with the Kernel address in secondary mono and a copy button, and "EntryPoint nonce" with its value in mono. The mode actions follow 8px below as 24px buttons: Switch to smart or Switch to Kernel (stroked), or Revoke delegation (ghost red, which asks in place with a solid red confirmation), and a secondary-ink "Advanced" text disclosure with a chevron. Open, Advanced lists the two plain modes as full-bleed rows under a faint rule, each a 13px name over a 12px tertiary sentence, with an accent check on the current one. A change shows a tertiary status line while the node updates and a red 12px sentence if it fails. Contract code gets the label alone. When the network's AA addresses hold unknown code, a yellow notice under the plate names them and Switch to smart and Switch to Kernel are disabled.

**Arrival:** when the active account changes, the plate takes an accent wash at 12% and lets it go over 600ms (`cubic-bezier(0.16, 1, 0.3, 1)`). It is the one authored moment in the product and it is off under `prefers-reduced-motion`.

### Account Row
The full accounts list (All accounts). Each row shows the alias in Body medium (if set) over the truncated address in Data Small, with the balance right-aligned in Data and an 11px unit beside it. A 44px drawer pull on the right edge (faintest fill, an arrow or check icon) opens inline editing of balance, nonce and alias. The active account's row is filled with the accent wash (`surface/fill/devwallet/active`) and carries no bar or rule. Other rows hover to the faintest fill. Rows separate with faint hairlines, not gaps. The active network row in Networks uses the same wash.

### List Rows
Token, dApp and activity rows on the Account home share one shape: at least 48px, 8px 12px padding, a 14px tertiary icon where there is one, a 13px medium title over 12px tertiary metadata (6px apart), a right-aligned mono value, and faint rules between rows. Row tools (copy, hide, send) rest at zero opacity and fade in over 120ms on hover or focus-within. Linked rows hover to the faintest fill.

### Decoded ABI and Data Views
Function signatures render inline: keywords (`function`, `returns`, `payable`) and parameter types in tertiary ink, the function name in medium weight, and parameter names in primary ink. Decoded parameter tables put the type and name left-aligned in tertiary ink and the value right-aligned in Data Small, with a chevron to expand arrays and tuples. Nested tuples indent with a hairline guide.

### Toggle
A 4px-radius track with a 2px-radius 16px knob that slides over 200ms. Off is the strongest fill; on is the accent, with a white knob on teal and an On Amber knob on amber.

### Toasts
Square, 8px padding, Body-size titles in regular weight, with icons hidden. Neutral toasts use the recess-raised surface with a fill-colored border. Success uses the green tint and error uses the red tint, each with its tint's own text color. Toasts stack at the panel edge.

### Mine
The pickaxe in the status line swings once (0° to 45° and back, 300ms linear) for each new block, because the icon remounts per block number. It is still under reduced motion.

## Do's and Don'ts

### Do:
- **Do** set every chain-produced value (address, hash, balance, block, chain id, RPC URL, token name, calldata) in IBM Plex Mono with tabular numerals, and every human label in Inter.
- **Do** keep corners square (0px) on every surface and control. Use circles only for status dots.
- **Do** separate content with 1px hairlines (#dcd9d4 on paper, #3c3f43 on black) and tonal steps instead of gaps, cards or shadows.
- **Do** use Prompt Teal (#00717f) on Warm Paper and Phosphor Amber (#f9b64f) on Terminal Black, and only for active, selected and focused states: a 1.5px rule on the open switcher, the active nav item or tab, the wash on a selected row, the check on the active account, a focus outline or border, the caret and the selection.
- **Do** keep every piece of text at 11px or larger, units included; label readouts with 11px sentence-case tertiary Inter above the value.
- **Do** truncate long hex in the middle in the switcher and rows, and give the full value through a copy button or tooltip.
- **Do** keep node state in the status line and account switching in the switcher bar, at side-panel width (about 320–480px).
- **Do** report the node offline inline (red status line plus the banner) and leave the last known state readable.
- **Do** turn off authored motion (the plate's arrival wash, the pickaxe swing, the switcher list's entrance and chevron turn) under `prefers-reduced-motion`.

### Don't:
- **Don't** drift toward a consumer crypto wallet: no rounded balance cards, gradient fills, glassy surfaces or oversized hero balances. The logo is the only gradient.
- **Don't** drift toward a generic SaaS dashboard: no card grids, soft drop shadows on resting surfaces, pill badges or big rounded buttons. The floating-layer shadow belongs to layers that float over content and nowhere else.
- **Don't** add sci-fi HUD kitsch: no neon glow, scanlines, glitch effects, the old #39ff14 neon green, or display fonts like Orbitron.
- **Don't** use the accent as a status color or a CTA fill. Primary actions stay ink-on-paper or white-on-black.
- **Don't** use Phosphor Amber for a warning. Warnings use the yellow tint plus an icon or label.
- **Don't** use serif or script faces. The obolos dApp's Gentium Plus, Newsreader and Allura do not belong in DevWallet.
- **Don't** signal state with hue alone. Every colored dot, border or tint has a text label or icon beside it.
- **Don't** block the panel when the node is offline; there is no offline dialog.
- **Don't** set a label above a title or alias. Labels sit above readout values only.
