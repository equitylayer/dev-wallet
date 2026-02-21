import type { Address } from 'viem'
import type { GetLogsParameters } from 'viem'
import { erc20Abi } from 'viem'

import type { Client } from '~/viem'

export async function getAccountTokens(
  client: Client,
  {
    address,
    fromBlock,
    toBlock,
  }: {
    address: Address
    fromBlock: GetLogsParameters['fromBlock']
    toBlock: GetLogsParameters['toBlock']
  },
) {
  const effectiveFromBlock = 0n
  const effectiveToBlock = toBlock ?? 'latest'
  console.log(fromBlock)
  // Transfer event signature hash (keccak256 of "Transfer(address,address,uint256)")
  const transferEventSignature =
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as const

  // Pad address to 32 bytes for topic matching
  const paddedAddress = `0x000000000000000000000000${address
    .slice(2)
    .toLowerCase()}` as const

  const [transfersFrom, transfersTo] = await Promise.all([
    // Transfers FROM this address: topic[1] = address
    client
      .getLogs({
        fromBlock: effectiveFromBlock,
        toBlock: effectiveToBlock,
        topics: [transferEventSignature, paddedAddress],
      } as any) // Type assertion needed for raw topics API
      .catch((err) => {
        console.error('Error fetching transfersFrom:', err)
        return []
      }),
    // Transfers TO this address: topic[2] = address
    client
      .getLogs({
        fromBlock: effectiveFromBlock,
        toBlock: effectiveToBlock,
        topics: [transferEventSignature, null, paddedAddress],
      } as any) // Type assertion needed for raw topics API
      .catch((err) => {
        console.error('Error fetching transfersTo:', err)
        return []
      }),
  ])

  const relevantTransfers = [...transfersFrom, ...transfersTo]

  const potentialTokens = [
    ...new Set(
      relevantTransfers.map((t) => t.address.toLowerCase() as Address),
    ),
  ]

  const erc20Tokens = await Promise.all(
    potentialTokens.map(async (tokenAddress) => {
      try {
        const decimals = await client.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'decimals',
        })
        const isValid =
          typeof decimals === 'number' && decimals >= 0 && decimals <= 255
        if (!isValid) {
          console.warn(
            `Token ${tokenAddress} has invalid decimals: ${decimals}. Skipping.`,
          )
        }
        return isValid ? tokenAddress : null
      } catch (_err) {
        return null
      }
    }),
  )

  return erc20Tokens.filter((token): token is Address => token !== null)
}
