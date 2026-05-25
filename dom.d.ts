/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

declare module 'which-pm-runs' {
  export function whichPMRuns():
    | undefined
    | { name: string; version: string }
}
