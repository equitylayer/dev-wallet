// JSON can't hold a bigint, so the stores keep one as the string
// `#bigint.<decimal>`. The stores also hold strings that sites sent (a pending
// request's params, a token's name), and a site can send that same text. So
// every other string that starts with `#` is stored with one more `#` in
// front, and loses it when read back: a site's string never reads back as a
// bigint, and only the replacer's own tags revive.
//
// What an earlier version stored has no escaping. Its bigints still revive
// (`#bigint.<decimal>` is the same tag); a tag that isn't a number stays a
// string instead of throwing; only an old string that started with `##`
// would read back with one `#` less.
const BIGINT_TAG = '#bigint.'
const BIGINT = /^#bigint\.(-?\d+)$/

export function replacer(_: string, value: unknown) {
  if (typeof value === 'bigint') return `${BIGINT_TAG}${value.toString()}`
  if (typeof value === 'string' && value.startsWith('#')) return `#${value}`
  return value
}

export function reviver(_: string, value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('#')) return value
  if (value.startsWith('##')) return value.slice(1)
  const match = BIGINT.exec(value)
  return match ? BigInt(match[1] as string) : value
}
