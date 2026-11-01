import type { Address } from 'viem'

/**
 * The accounts visible on `rpcUrl`: those without an `rpcUrl` (local accounts)
 * and those on the given one. With `activeFirst`, the active `account` leads
 * the list, but only when it is itself visible.
 */
export function filterAccounts<
  T extends { address: Address; rpcUrl?: string },
>({
  account,
  accounts,
  activeFirst = false,
  rpcUrl,
}: {
  account?: T
  accounts: readonly T[]
  activeFirst?: boolean
  rpcUrl?: string
}): T[] {
  const visible = accounts.filter((x) => !x.rpcUrl || x.rpcUrl === rpcUrl)
  if (!activeFirst || !account) return visible
  if (account.rpcUrl && account.rpcUrl !== rpcUrl) return visible

  const active = account.address.toLowerCase()
  return [
    account,
    ...visible.filter((x) => x.address.toLowerCase() !== active),
  ]
}

/**
 * The account a request that names none goes from on `rpcUrl`: the first
 * that `eth_accounts` lists there, so the active account when it is visible.
 * The approval screen and the background both pick it this way.
 */
export function defaultAccount<
  T extends { address: Address; rpcUrl?: string },
>(args: { account?: T; accounts: readonly T[]; rpcUrl?: string }): T | undefined {
  return filterAccounts({ ...args, activeFirst: true })[0]
}

/** Whether both lists hold the same addresses in the same order. */
export function sameAddresses(
  a: readonly { address: Address }[],
  b: readonly { address: Address }[],
): boolean {
  return (
    a.length === b.length &&
    a.every((x, i) => x.address.toLowerCase() === b[i]?.address.toLowerCase())
  )
}
