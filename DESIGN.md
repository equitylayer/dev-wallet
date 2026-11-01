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
  phosphor-amber: "#f9b64f"
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
    letterSpacing: "0.41px"
  headline:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "22px"
    fontWeight: 500
    lineHeight: "29px"
    letterSpacing: "0.35px"
  title:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "21px"
    letterSpacing: "0.35px"
  body-large:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "21px"
    letterSpacing: "0.35px"
  body-prose:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "19px"
    letterSpacing: "0.48px"
  body:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "15px"
    letterSpacing: "0.52px"
  caption:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "15px"
    letterSpacing: "0.56px"
  label:
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "9px"
    fontWeight: 400
    lineHeight: "11px"
    letterSpacing: "0.56px"
  data:
    fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "15px"
    letterSpacing: "0px"
    fontFeature: "'tnum' 1"
  data-small:
    fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "15px"
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
  12px: "12px"
  16px: "16px"
  20px: "20px"
  24px: "24px"
  32px: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.warm-paper-raised}"
    typography: "{typography.body-large}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "36px"
  button-primary-dark:
    backgroundColor: "{colors.glyph}"
    textColor: "{colors.terminal-black}"
    typography: "{typography.body-large}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "36px"
  button-compact-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.none}"
    padding: "0 6px"
    height: "24px"
  button-compact-stroked:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.none}"
    padding: "0 6px"
    height: "24px"
  button-destructive-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.signal-red}"
    typography: "{typography.caption}"
    rounded: "{rounded.none}"
    padding: "0 6px"
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
  header-label:
    textColor: "{colors.ink-tertiary}"
    typography: "{typography.label}"
  toast:
    backgroundColor: "{colors.warm-paper-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "8px"
---

# Design System: DevWallet

<!-- Decided 2026-11-01 but not yet in code: the Inter + IBM Plex Mono pairing (Orbitron dropped, and font loading fixed), and the Prompt Teal / Phosphor Amber accents. They replace text/accent/active, --toggle-active-bg and surface/fill/devwallet/active. Everything else describes the shipped system in src/design-system. -->

## Overview

**Creative North Star: "The Terminal Sidecar"**

DevWallet is a terminal pane docked beside the browser. It sits in Chrome's side panel next to the dApp being built and reads like an instrument the developer glances at between keystrokes. Readouts are dense, every edge is hard, and color appears only when the chain has something to say. The interface is a narrow column of hairline-ruled cells: an instrument strip of account, network and block readouts across the top, equal-width tabs below it, then lists of rows. Hierarchy comes from type size, ink weight and tonal steps between surfaces. It never comes from cards, shadows or ornament.

There are two grounds and they are not mirror images. **Warm Paper** (light) is an unbleached off-white with warm grey-brown ink, a lab notebook on the bench. **Terminal Black** (dark) is pure black under a near-black working canvas with cool grey glyphs, the classic terminal. Each theme has exactly one accent: **Prompt Teal** on paper, taken from the cyan end of the logo's prompt glyph, and **Phosphor Amber** on black, after amber-phosphor CRTs. The accent marks what is active, selected or focused, and nothing else.

Type is split by who wrote the words. Humans get Inter: labels, headings, buttons, prose. Machines get IBM Plex Mono with tabular numerals: addresses, hashes, balances, block numbers, RPC URLs, calldata, ABI signatures. This pairing matches the obolos dApp's sans-serif faces. DevWallet does not use obolos's serif or script faces.

Confirmed anti-references: DevWallet never looks like a **consumer crypto wallet** (rounded balance cards, gradients, glassy surfaces, hero coin numbers), a **generic SaaS dashboard** (card grids, soft drop shadows, pill badges, big rounded buttons), or **sci-fi HUD kitsch** (neon glow, scanlines, glitch effects, display fonts like Orbitron).

**Key Characteristics:**
- Narrow, dense, column-first. It is designed for the side panel, not the page.
- Square corners everywhere. Circles appear only on status dots.
- 1px hairlines and tonal steps instead of shadows.
- Inter for people, IBM Plex Mono for the machine.
- Monochrome base. Hue means state (signal) or focus (accent), never decoration.
- One accent per theme: Prompt Teal on Warm Paper, Phosphor Amber on Terminal Black.

## Colors

The palette is a monochrome base of ink on paper (light) or glyph on black (dark), with four signal hues and one accent per theme.

### Primary
- **Prompt Teal** (#00717f): the light-theme accent. Used for the active tab rule, the selected-account rule and wash, toggles that are on, focus borders and rings, the text caret and inline links. It reaches 5.6:1 on the raised paper canvas. Washes use it at about 6% alpha and focus rings at about 18%.
- **Phosphor Amber** (#f9b64f): the dark-theme accent, with the same roles as Prompt Teal. It reaches 9.8:1 on the raised terminal canvas. Washes use it at about 7% alpha and focus rings at about 22%. Text placed on an amber fill is near-black (#1d1407).

### Neutral (light: Warm Paper)
- **Warm Paper** (#f9f7f4): the page ground (`surface/primary`).
- **Raised Paper** (#fdfcfb): the panel canvas the whole app sits on (`surface/primary/elevated`), plus input fields and toasts.
- **Paper Recess** (#f3f2ee): secondary grounds and sunken regions (`surface/secondary`).
- **Paper Fills** (#e8e5e0 / #ede9e4 / #f5f3f0 / #faf9f7): fills from strongest to faintest. Used for the stroked-button border, solid-fill buttons, the account row's drawer pull and hover washes.
- **Ink** (#2a2520): primary text, and the fill of the primary button.
- **Ink Secondary / Tertiary / Quaternary** (#5a5550 / #7a7570 / #9a9590): supporting text, header labels and inactive tabs, then disabled or placeholder-adjacent text.
- **Paper Rule** (#dcd9d4) and **Faint Rule** (#ebe8e3): hairlines, input borders and the separators between rows.

### Neutral (dark: Terminal Black)
- **Terminal Black** (#000000): the page ground (`surface/primary`).
- **Terminal Raised** (#191a1c): the panel canvas the app actually renders on (`surface/primary/elevated`).
- **Terminal Recess** (#1b1c1e) and **Recess Raised** (#222324): secondary grounds.
- **Terminal Fills** (#44474b / #3e3f43 / #2e2f30 / #212224): fills from strongest to faintest, in the same roles as the paper fills.
- **Glyph** (#ffffff): primary text, and the fill of the primary button.
- **Glyph Secondary / Tertiary / Quaternary** (#c2c5cb / #9a9ba1 / #78797e): supporting text tiers.
- **Terminal Rule** (#3c3f43) and **Faint Rule** (#2b2c2f): hairlines and separators.

### Signals
Each signal has a solid value and a tint, with separate values per theme. The tint carries its own text color: blue #0165d1 / #4fa1f2, green #2a9764 / #8cdeb7, red #dc3d43 / #ffb2b5, yellow #ae8b3a / #efc000.
- **Signal Green** (#2a9764 / dark #30a46c): node online, success toasts, confirmed actions.
- **Signal Red** (#dc3d43 / dark #f2555a): node offline, errors, invalid inputs, destructive buttons.
- **Signal Yellow** (#f9d24a / dark #ffdf3c): warnings and inputs in a warning state.
- **Signal Blue** (#3374f4 / dark #3898fe): informational emphasis and blue button variants.

### Named Rules
**The Signal-Only Rule.** Hue means state. Green is online or success, red is offline, error or destructive, yellow is warning, blue is information. Everything else is ink on paper or glyph on black.

**The Two Inks Rule.** Each theme has exactly one accent: Prompt Teal on Warm Paper, Phosphor Amber on Terminal Black. Never use one theme's accent in the other theme. The accent marks active, selected and focused things only. It is never a button fill for a call to action, and never a status color.

**The Amber Is Not a Warning Rule.** Phosphor Amber sits near Signal Yellow on Terminal Black. Never use amber for a warning. A warning always pairs the yellow tint with an icon or a text label, so it never relies on hue alone.

## Typography

**UI Font:** Inter (with system-ui, -apple-system, Segoe UI)
**Data Font:** IBM Plex Mono (with ui-monospace, Menlo, Consolas)

**Character:** A neutral, highly legible grotesque for everything a person reads, beside a squared-off mono with a technical feel for everything the chain emits. In use the panel reads like a terminal with good labels.

**Status:** this is a decided change that has not shipped. Today `tokens.ts` declares Orbitron for the body, addresses and numbers, JetBrains Mono for code, and Inter as an unused default. None of the three loads: vanilla-extract drops the `@fontsource` CSS imports in `global.css.ts`, so the built extension has no `@font-face` rules or font files and renders in the OS monospace. Implementing this section means four things. Import the font CSS from a plain entry module, not a `.css.ts` file. Set the body to Inter. Point the `mono`, `address` and `numeric` roles at IBM Plex Mono. Replace the capsize `fontMetrics` in `tokens.ts`, which are the old SF Pro values, with Inter's values from `@capsizecss/metrics`.

### Hierarchy
- **Display** (500, 32px, 40px): the DevWallet wordmark on the onboarding start screen. Used nowhere else.
- **Headline** (500, 22px, 29px): rare section headings in onboarding and playgrounds.
- **Title** (400, 16px, 21px): screen titles in the container header (for example Settings, Networks, contract and transaction details).
- **Body Large** (400, 15px, 21px): button labels at 36px height and input text at 36px. It is also the `Text` default size.
- **Body Prose** (400, 14px, 19px): onboarding instructions and explanatory sentences.
- **Body** (400, 12px, 15px): the workhorse for row titles, account aliases, header values and toast titles.
- **Caption** (400, 11px, 15px): compact button labels at 18–24px height and secondary metadata.
- **Label** (400, 9px, 11px, +0.56px, UPPERCASE): instrument-strip labels (ACCOUNT, RPC URL, BLOCK), unit labels (ETH) and field captions. Always tertiary ink.
- **Data** (IBM Plex Mono 400, 12px, 15px, tabular): addresses, hashes, balances, block numbers, chain ids, RPC URLs.
- **Data Small** (IBM Plex Mono 400, 11px, 15px, tabular): truncated addresses under an alias, decoded ABI values, compact inputs that take hex.

Weights stay in a tight range: regular for nearly everything, medium (500) for names and emphasis, semibold (600) rarely. Light and heavy exist in the scale but carry no role.

### Named Rules
**The Data Wears Mono Rule.** If the chain produced it (an address, hash, number, calldata, ABI type, RPC URL or block), it is set in IBM Plex Mono with tabular numerals. If a person wrote it (a label, alias, button or sentence), it is set in Inter.

**The Nine-Pixel Label Rule.** Readout labels are 9px uppercase Inter in tertiary ink, placed above their value. A label never competes with the reading under it.

## Layout

The app is one full-height column sized to Chrome's side panel. It must work from about 320px wide, and the design-system breakpoint is 480px. A fixed 120px instrument strip, the header, sits above routed content. It has three hairline-separated rows. The top bar holds a 36px home cell, the account, the dApp connection and settings, divided by vertical hairlines. The network row holds the RPC URL with its status dot, and the chain. The block row holds the block number and the mining controls. Below the strip, primary navigation is a row of equal-width tabs (Accounts, Contracts, TXs, Blocks), followed by virtualized, infinitely scrolling lists.

Screens use a shared container: a 16px title bar with 8px side insets and a hairline beneath it, content inset 8px horizontally and 12–16px vertically, and an optional footer with 12px vertical padding. Lists run edge to edge, separated by hairlines rather than gaps.

Spacing uses a 4px-based scale named in pixels. The common steps are 4px and 8px (most gaps), 12px (sections inside a screen), 16px and 20px (between groups), with 2px and 6px for tight label-to-value pairs. The larger steps (24–32px) appear only on onboarding. Density is deliberate: the panel shows as much chain state as it can while staying legible.

### Named Rules
**The Panel Width Rule.** Design at side-panel width first. Nothing scrolls horizontally except code and calldata. Long values truncate in the middle (`0x7099…79C8`) and never wrap mid-address.

## Elevation & Depth

The system is flat. Depth comes from tonal layering: page ground, raised canvas, then fills. Structure comes from 1px hairlines. No surface casts a shadow. Hover is a per-surface filter (about 0.98 brightness on paper, about 0.85–0.95 contrast on black), not a lift. Press is a 2% shrink (`scale(0.98)`). The one real shadow is on the toggle's knob, a 1px physical cue. The active tab's underline is an inset rule, not elevation.

### Shadow Vocabulary
- **Toggle knob** (`box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3)`): only on the sliding knob of the toggle.
- **Active tab rule** (`box-shadow: inset 0 -1.5px 0 <accent>`): a structural underline. It is not depth. Today it uses primary ink; the decided accent replaces that.

### Named Rules
**The Hairline Rule.** Separate with a 1px rule or a step in tone, never a shadow. If something seems to need a shadow, it is in the wrong layer.

## Shapes

Corners are square. Buttons, inputs, tabs, rows, dialogs and toasts all use a radius of 0 (the toaster explicitly sets `--border-radius: 0`). The only rounding is functional. Status dots and separator end caps are full circles (9999px). The toggle uses a softly squared 4px track and a 2px knob so it still reads as a physical switch. The logo tile, a rounded square with a dark teal-to-navy gradient holding a cream "D" and a mint-to-cyan prompt chevron, is the only rounded rectangle in the product. It is an identity asset, not a pattern to repeat.

### Named Rules
**The Square Corner Rule.** If it is a surface or a control, its corners are square. A circle means a status. The logo is the only rounded rectangle.

## Components

### Buttons
Utilitarian and quiet: most buttons are compact, text-only and square.
- **Shape:** square (0px).
- **Primary** (`solid invert`): ink on paper in light, white on black in dark. Heights and labels go together: 16px (9px label, 4px padding), 18–24px (11px label, 6px padding), 36px (15px label, 12px padding), 44px (18px label, 16px padding). Reserve it for the single forward action on a screen (Send, Continue).
- **Compact ghost** (`ghost primary`, 24px): the most common button. Transparent, with about a 5% ink wash on hover. Used for row actions and header controls.
- **Compact stroked** (`stroked fill`, 24px): a transparent button with a 1px fill-colored border, for secondary actions beside a value.
- **Signal variants:** ghost, stroked, solid and tint versions in red, green and blue. Destructive actions use ghost red or stroked red, and solid red only for a final confirmation.
- **Hover / Press:** per-surface brightness or contrast filter on hover, `scale(0.98)` on press, no color transition. Disabled buttons are 50% opacity with a not-allowed cursor.
- **Focus:** today there is no visible focus ring (the reset removes outlines). The decided treatment is a 1px accent border plus a 2px accent ring at about 18–22% alpha.

### Inputs / Fields
- **Style:** raised-canvas background, 1px border in ink at 20% (30% on hover), square corners, 36px default height (15px text, 12px padding) or 24px compact (11px text, 6px padding). Placeholders are text at 40%.
- **Focus:** today the border deepens to ink at 70%. The decided treatment is an accent border plus a 2px accent ring at low alpha, with an accent caret.
- **Error / Warning / Disabled:** a red border for invalid or error, a yellow border for warning, and the recess background with no pointer events when disabled.
- **Hex and addresses** go in Data Small (IBM Plex Mono).

### Navigation
- **Instrument strip (header):** three hairline-separated rows of label-over-value readouts. Labels follow the Nine-Pixel Label Rule. Values are Body for names and Data for numbers and addresses. Clickable cells hover to the faintest fill. The account cell briefly flashes when its balance changes (a `--flash-color` pulse), and the mine button's pickaxe rocks 45° over 0.3s when a block is mined.
- **Tabs:** equal-width text tabs in Body. Inactive tabs are tertiary ink. The active tab is primary ink with a 1.5px inset bottom rule in the theme accent. There is no transition: switching is instant.
- **Status dot:** an 8px circle that is green when listening, red when offline and ink at 50% while pending. It always sits beside a text value, never alone.

### Account Row (signature component)
The account list is DevWallet's core surface. Each row shows the alias in Body medium (if set) over the truncated address in Data Small, with the balance right-aligned in Data and a 9px unit label beneath it. A 44px drawer pull on the right edge (faintest fill, arrow or checkmark glyph) opens inline editing of balance, nonce and alias. The selected account carries a 2px accent rule on its left edge, a faint accent wash and an accent-tinted address. Rows separate with faint hairlines, not gaps.

### Decoded ABI and Data Views
Function signatures render inline: keywords (`function`, `returns`, `payable`) and parameter types in tertiary ink, the function name in medium weight, and parameter names in primary ink. Decoded parameter tables put the type and name left-aligned in tertiary ink and the value right-aligned in Data Small, with a chevron to expand arrays and tuples. Nested tuples indent with a hairline guide.

### Toasts
Square, 8px padding, Body-size titles in regular weight, with icons hidden. Neutral toasts use the recess-raised surface with a fill-colored border. Success uses the green tint and error uses the red tint, each with its tint's own text color. Toasts stack at the panel edge.

## Do's and Don'ts

### Do:
- **Do** set every chain-produced value (address, hash, balance, block, chain id, RPC URL, calldata) in IBM Plex Mono with tabular numerals, and every human label in Inter.
- **Do** keep corners square (0px) on every surface and control. Use circles only for status dots.
- **Do** separate content with 1px hairlines (#dcd9d4 on paper, #3c3f43 on black) and tonal steps instead of gaps, cards or shadows.
- **Do** use Prompt Teal (#00717f) on Warm Paper and Phosphor Amber (#f9b64f) on Terminal Black, and only for active, selected and focused states.
- **Do** label readouts with 9px uppercase tertiary Inter above the value.
- **Do** truncate long hex in the middle and give the full value through a copy button or tooltip.
- **Do** design at side-panel width first (about 320–480px) and keep the instrument strip readable at that width.

### Don't:
- **Don't** drift toward a consumer crypto wallet: no rounded balance cards, gradients, glassy surfaces or oversized hero balances.
- **Don't** drift toward a generic SaaS dashboard: no card grids, soft drop shadows, pill badges or big rounded buttons.
- **Don't** add sci-fi HUD kitsch: no neon glow, scanlines, glitch effects, the old #39ff14 neon green, or display fonts like Orbitron.
- **Don't** use the accent as a status color or a CTA fill. Primary actions stay ink-on-paper or white-on-black.
- **Don't** use Phosphor Amber for a warning. Warnings use the yellow tint plus an icon or label.
- **Don't** use serif or script faces. The obolos dApp's Gentium Plus, Newsreader and Allura do not belong in DevWallet.
- **Don't** signal state with hue alone. Every colored dot, border or tint has a text label or icon beside it.
