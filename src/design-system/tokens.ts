import { createStyleObject as capsize } from '@capsizecss/core'
import interMetrics from '@capsizecss/metrics/inter'

export type Theme = 'light' | 'dark'
export type ColorScheme = 'light' | 'dark'

export type BackgroundColorValue = Record<
  Theme,
  {
    value: string
    scheme: ColorScheme
    border?: string
    text?: string
    hover?: {
      brightness?: string
      contrast?: string
    }
  }
>
export const backgroundColor = {
  'surface/primary': {
    light: {
      value: '#f9f7f4',
      scheme: 'light',
      hover: {
        brightness: '0.98',
      },
    },
    dark: {
      value: '#000000',
      scheme: 'dark',
      hover: {
        contrast: '0.85',
      },
    },
  },
  'surface/primary/elevated': {
    light: {
      value: '#fdfcfb',
      scheme: 'light',
      hover: {
        brightness: '0.98',
      },
    },
    dark: {
      value: '#191A1C',
      scheme: 'dark',
      hover: {
        contrast: '0.95',
      },
    },
  },
  'surface/secondary': {
    light: {
      value: '#f3f2ee',
      scheme: 'light',
      hover: {
        brightness: '0.98',
      },
    },
    dark: {
      value: '#1B1C1E',
      scheme: 'dark',
      hover: {
        contrast: '0.85',
      },
    },
  },
  'surface/secondary/elevated': {
    light: {
      value: '#fdfcfb',
      scheme: 'light',
      hover: {
        brightness: '0.98',
      },
    },
    dark: {
      value: '#222324',
      scheme: 'dark',
      hover: {
        contrast: '0.85',
      },
    },
  },
  'surface/fill': {
    light: {
      value: '#e8e5e0',
      scheme: 'light',
      hover: {
        brightness: '0.98',
      },
    },
    dark: {
      value: '#44474B',
      scheme: 'dark',
      hover: {
        contrast: '0.85',
      },
    },
  },
  'surface/fill/secondary': {
    light: {
      value: '#ede9e4',
      scheme: 'light',
      hover: {
        brightness: '0.98',
      },
    },
    dark: {
      value: '#3E3F43',
      scheme: 'dark',
      hover: {
        contrast: '0.85',
      },
    },
  },
  'surface/fill/tertiary': {
    light: {
      value: '#f5f3f0',
      scheme: 'light',
      hover: {
        brightness: '0.98',
      },
    },
    dark: {
      value: '#2e2f30',
      scheme: 'dark',
      hover: {
        contrast: '0.95',
      },
    },
  },
  'surface/fill/devwallet/active': {
    light: {
      value: '#e3eff0',
      scheme: 'light',
      hover: {
        brightness: '0.98',
      },
    },
    dark: {
      value: '#2c2416',
      scheme: 'dark',
      hover: {
        contrast: '0.95',
      },
    },
  },
  'surface/accent': {
    light: {
      value: '#00717f',
      scheme: 'dark',
      text: '#ffffff',
      hover: {
        brightness: '0.95',
      },
    },
    dark: {
      value: '#f9b64f',
      scheme: 'light',
      text: '#1d1407',
      hover: {
        brightness: '0.95',
      },
    },
  },
  'surface/fill/quarternary': {
    light: {
      value: '#faf9f7',
      scheme: 'light',
      hover: {
        brightness: '0.98',
      },
    },
    dark: {
      value: '#212224',
      scheme: 'dark',
      hover: {
        contrast: '0.95',
      },
    },
  },
  'surface/blue': {
    light: {
      value: '#3374F4',
      scheme: 'dark',
      hover: {
        brightness: '0.95',
      },
    },
    dark: {
      value: '#3898FE',
      scheme: 'dark',
      hover: {
        brightness: '0.95',
      },
    },
  },
  'surface/blueTint': {
    light: {
      value: '#d6e4f1',
      scheme: 'light',
      text: '#0165d1',
      hover: {
        brightness: '0.95',
      },
    },
    dark: {
      value: '#0f3058',
      scheme: 'dark',
      text: '#4fa1f2',
      hover: {
        brightness: '0.95',
      },
    },
  },
  'surface/green': {
    light: {
      value: '#2a9764',
      scheme: 'dark',
      hover: {
        brightness: '0.95',
      },
    },
    dark: {
      value: '#30a46c',
      scheme: 'dark',
      hover: {
        brightness: '0.95',
      },
    },
  },
  'surface/greenTint': {
    light: {
      value: '#ddf3e4',
      scheme: 'light',
      text: '#2a9764',
      hover: {
        brightness: '0.98',
      },
    },
    dark: {
      value: '#123929',
      scheme: 'dark',
      text: '#8cdeb7',
      hover: {
        brightness: '0.9',
      },
    },
  },
  'surface/red': {
    light: {
      value: '#dc3d43',
      scheme: 'dark',
      hover: {
        brightness: '0.98',
      },
    },
    dark: {
      value: '#f2555a',
      scheme: 'dark',
      hover: {
        brightness: '0.9',
      },
    },
  },
  'surface/redTint': {
    light: {
      value: '#ffe5e4',
      scheme: 'light',
      text: '#dc3d43',
      hover: {
        brightness: '0.95',
      },
    },
    dark: {
      value: '#541b1e',
      scheme: 'dark',
      text: '#ffb2b5',
      hover: {
        brightness: '0.95',
      },
    },
  },
  'surface/yellow': {
    light: {
      value: '#F9D24A',
      scheme: 'light',
      hover: {
        brightness: '0.95',
      },
    },
    dark: {
      value: '#FFDF3C',
      scheme: 'light',
      hover: {
        brightness: '0.95',
      },
    },
  },
  'surface/yellowTint': {
    light: {
      value: '#fff8bb',
      scheme: 'light',
      text: '#ae8b3a',
      hover: {
        brightness: '0.95',
      },
    },
    dark: {
      value: '#3e3000',
      scheme: 'dark',
      text: '#efc000',
      hover: {
        brightness: '0.95',
      },
    },
  },
  'surface/invert': {
    light: {
      value: 'black',
      scheme: 'dark',
      hover: {
        contrast: '0.7',
      },
    },
    dark: {
      value: 'white',
      scheme: 'light',
      hover: {
        brightness: '0.95',
      },
    },
  },
  'surface/white': {
    light: {
      value: 'white',
      scheme: 'light',
      hover: {
        brightness: '0.98',
      },
    },
    dark: {
      value: 'white',
      scheme: 'light',
      hover: {
        brightness: '0.95',
      },
    },
  },
  'surface/black': {
    light: {
      value: 'black',
      scheme: 'dark',
      hover: {
        contrast: '0.7',
      },
    },
    dark: {
      value: 'black',
      scheme: 'dark',
      hover: {
        contrast: '0.85',
      },
    },
  },
} as const satisfies Record<string, BackgroundColorValue>
export type BackgroundColor = keyof typeof backgroundColor

export type ForegroundColorValue = Record<ColorScheme, string>
export const foregroundColor = {
  'separator/primary': {
    light: '#3d3932',
    dark: '#ffffff',
  },
  'separator/secondary': {
    light: '#5a5550',
    dark: '#9f9f9f',
  },
  'separator/tertiary': {
    light: '#dcd9d4',
    dark: '#3C3F43',
  },
  'separator/quarternary': {
    light: '#ebe8e3',
    dark: '#2B2C2F',
  },
  'stroke/primary': {
    light: '#dcd9d4',
    dark: '#3C3F43',
  },
  'stroke/secondary': {
    light: '#ebe8e3',
    dark: '#2B2C2F',
  },
  'text/primary': {
    light: '#2a2520',
    dark: '#FFFFFF',
  },
  'text/secondary': {
    light: '#5a5550',
    dark: '#C2C5CB',
  },
  'text/tertiary': {
    light: '#7a7570',
    dark: '#9A9BA1',
  },
  'text/quarternary': {
    light: '#9a9590',
    dark: '#78797E',
  },
  // Prompt Teal (light) / Phosphor Amber (dark). Active, selected and focused
  // only; never a status. See "Amber Is Not a Warning" in DESIGN.md.
  'text/accent/active': {
    light: '#00717f',
    dark: '#f9b64f',
  },
} as const satisfies Record<string, ForegroundColorValue>
export type ForegroundColor = keyof typeof foregroundColor

export type DefaultInheritedColorValue = Record<ColorScheme, string>
export const defaultInheritedColor = {
  accent: {
    light: backgroundColor['surface/invert'].light.value,
    dark: backgroundColor['surface/invert'].dark.value,
  },
  border: {
    light: foregroundColor['stroke/primary'].light,
    dark: foregroundColor['stroke/primary'].dark,
  },
  text: {
    light: foregroundColor['text/primary'].light,
    dark: foregroundColor['text/primary'].dark,
  },
} as const satisfies Record<string, DefaultInheritedColorValue>
export type InheritedColor = keyof typeof defaultInheritedColor

export const breakpoints = {
  '480px': '480px',
}
export type Breakpoint = keyof typeof breakpoints

export const fontFamily = {
  default:
    "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  // Data wears mono: addresses, hashes, numbers, selectors and calldata.
  mono: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
  address: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
  numeric: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
}
export type FontFamily = keyof typeof fontFamily

export type FontAttributes = {
  letterWidth: number
  fontSize: number
  lineHeight: number | `${number}%`
  letterSpacing: number
}

// letterWidth is the IBM Plex Mono advance (0.6em). Text.Truncated uses it to
// fit addresses and hashes, which are always set in mono.
const attrs = (fontSize: number, lineHeight: number, letterSpacing: number) =>
  ({
    fontSize,
    lineHeight,
    letterSpacing,
    letterWidth: fontSize * 0.6,
  }) satisfies FontAttributes

// Scale from DESIGN.md. Nothing goes below 11px, units included. 9px and
// 10px remain only until the screens that still use them are migrated.
export const fontAttributes = {
  '9px': attrs(9, 11, 0.2),
  '10px': attrs(10, 13, 0.2),
  '11px': attrs(11, 15, 0.1),
  '12px': attrs(12, 16, 0.1),
  '13px': attrs(13, 17, 0),
  '14px': attrs(14, 20, 0),
  '15px': attrs(15, 20, -0.1),
  '16px': attrs(16, 21, -0.1),
  '18px': attrs(18, 23, -0.2),
  '20px': attrs(20, 25, -0.3),
  '22px': attrs(22, 28, -0.4),
  '26px': attrs(26, 32, -0.5),
  '32px': attrs(32, 40, -0.6),
} satisfies { [key: string]: FontAttributes }

function defineType(fontAttributes: FontAttributes, inline: boolean) {
  const { fontSize, lineHeight, letterSpacing } = fontAttributes
  const leading =
    typeof lineHeight === 'number'
      ? lineHeight
      : (fontSize * Number.parseInt(lineHeight)) / 100

  if (inline) return { fontSize, letterSpacing }
  return {
    ...capsize({ fontMetrics: interMetrics, fontSize, leading }),
    letterSpacing,
  }
}

export const fontSize = (inline: boolean) =>
  ({
    '9px': defineType(fontAttributes['9px'], inline),
    '10px': defineType(fontAttributes['10px'], inline),
    '11px': defineType(fontAttributes['11px'], inline),
    '12px': defineType(fontAttributes['12px'], inline),
    '13px': defineType(fontAttributes['13px'], inline),
    '14px': defineType(fontAttributes['14px'], inline),
    '15px': defineType(fontAttributes['15px'], inline),
    '16px': defineType(fontAttributes['16px'], inline),
    '18px': defineType(fontAttributes['18px'], inline),
    '20px': defineType(fontAttributes['20px'], inline),
    '22px': defineType(fontAttributes['22px'], inline),
    '26px': defineType(fontAttributes['26px'], inline),
    '32px': defineType(fontAttributes['32px'], inline),
  }) as const
export type FontSize = keyof ReturnType<typeof fontSize>

export const fontWeight = {
  light: '300',
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
} as const
export type FontWeight = keyof typeof fontWeight

export const spacing = {
  '0px': '0px',
  '1px': '1px',
  '2px': '0.125rem',
  '4px': '0.25rem',
  '6px': '0.325rem',
  '8px': '0.5rem',
  '12px': '0.75rem',
  '16px': '1rem',
  '20px': '1.25rem',
  '24px': '1.5rem',
  '28px': '1.75rem',
  '32px': '2rem',
  '36px': '2.25rem',
  '40px': '2.5rem',
  '44px': '2.75rem',
  '48px': '3rem',
  '52px': '3.25rem',
  '56px': '3.5rem',
  '60px': '3.75rem',
  '64px': '4rem',
  '68px': '4.25rem',
  '72px': '4.5rem',
  '76px': '4.75rem',
  '80px': '5rem',
  '84px': '5.25rem',
  '88px': '5.5rem',
  '92px': '5.75rem',
  '96px': '6rem',
  '102px': '6.5rem',
  '108px': '7rem',
  '114px': '7.5rem',
  '120px': '8rem',
  '136px': '9rem',
  '152px': '10rem',
} as const
export type Spacing = keyof typeof spacing

export const negatedSpacing = {
  '-0px': '-0px',
  '-1px': '-1px',
  '-2px': '-0.125rem',
  '-4px': '-0.25rem',
  '-6px': '-0.325rem',
  '-8px': '-0.5rem',
  '-12px': '-0.75rem',
  '-16px': '-1rem',
  '-20px': '-1.25rem',
  '-24px': '-1.5rem',
  '-28px': '-1.75rem',
  '-32px': '-2rem',
  '-36px': '-2.25rem',
  '-40px': '-2.5rem',
  '-44px': '-2.75rem',
  '-48px': '-3rem',
  '-52px': '-3.25rem',
  '-56px': '-3.5rem',
  '-60px': '-3.75rem',
  '-64px': '-4rem',
  '-68px': '-4.25rem',
  '-72px': '-4.5rem',
  '-76px': '-4.75rem',
  '-80px': '-5rem',
  '-84px': '-5.25rem',
  '-88px': '-5.5rem',
  '-92px': '-5.75rem',
  '-96px': '-6rem',
  '-102px': '-6.5rem',
  '-108px': '-7rem',
  '-114px': '-7.5rem',
  '-120px': '-8rem',
  '-136px': '-9rem',
  '-152px': '-10rem',
} as const
export type NegatedSpacing = keyof typeof negatedSpacing

export const positionSpacing = {
  '0': 0,
} as const
export type PositionSpacing = keyof typeof positionSpacing

export const radii = {
  round: 9999,
  '3px': 3,
  '6px': 6,
  '12px': 12,
  '14px': 14,
  '16px': 16,
  '18px': 18,
  '20px': 20,
  '24px': 24,
  '30px': 30,
}
export type Radius = keyof typeof radii

export const strokeWeights = {
  '1px': 1,
  '1.5px': 1.5,
  '2px': 2,
}
export type StrokeWeight = keyof typeof strokeWeights

// Symbol names map to Lucide icons in SFSymbol.tsx.
export const symbolNames = [
  'arrow.clockwise',
  'arrow.left.arrow.right',
  'checkmark',
  'clock',
  'doc.on.doc',
  'hammer.fill',
  'wallet.pass',
  'person.circle',
  'chevron.down',
  'chevron.right.2',
  'chevron.left',
  'trash',
  'xmark',
  'arrow.right',
  'arrowtriangle.left.and.line.vertical.and.arrowtriangle.right',
  'square.and.arrow.down',
  'gearshape.fill',
  'square.and.pencil',
  'plus',
  'gear',
  'minus',
  'backward.fill',
  'arrow.counterclockwise',
  'paperplane',
] as const
export type SymbolName = (typeof symbolNames)[number]

export const textAlignment = ['left', 'center', 'right'] as const
export type TextAlignment = (typeof textAlignment)[number]
