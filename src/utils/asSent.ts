/**
 * A value as the site sent it, for display: a string as it is, anything else
 * as JSON, or through `String` when JSON can't hold it (a bigint, a cycle) or
 * gives nothing (`undefined`). Never throws: the approval screens render it.
 */
export function asSent(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}
