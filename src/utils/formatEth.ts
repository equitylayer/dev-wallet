import { formatEther } from 'viem'

/**
 * ETH for display, grouped in en-US. Below 1: up to six decimals. From 1 up:
 * always two, so balances line up in a column.
 */
export function formatEth(value: bigint) {
  const ether = Number(formatEther(value))
  const small = ether !== 0 && Math.abs(ether) < 1
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: small || ether === 0 ? 0 : 2,
    maximumFractionDigits: small ? 6 : 2,
  }).format(ether)
}
