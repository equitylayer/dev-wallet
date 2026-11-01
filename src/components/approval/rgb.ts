// A plain module, because a .css.ts file can't export a function.
/** A theme color var (space-separated RGB channels) as a CSS color. */
export const rgb = (v: string, a?: number) =>
  a === undefined ? `rgb(${v})` : `rgb(${v} / ${a})`
