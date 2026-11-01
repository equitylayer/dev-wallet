import type { Address, GetLogsParameters } from 'viem'
import {
  BaseError,
  HttpRequestError,
  SocketClosedError,
  TimeoutError,
  WebSocketRequestError,
  erc20Abi,
} from 'viem'

import type { Client } from '~/viem'

// Only a failure to reach the node says nothing about the token; the caller
// must not treat it as a verdict. Any answer from the node (a revert, whatever
// error code the node uses for it, empty or undecodable data) means "not an
// ERC-20". Nodes differ on revert codes, so this checks for transport errors
// rather than listing revert shapes.
function isTransportFailure(err: unknown) {
  if (!(err instanceof BaseError)) return false
  return Boolean(
    err.walk(
      (e) =>
        e instanceof HttpRequestError ||
        e instanceof TimeoutError ||
        e instanceof WebSocketRequestError ||
        e instanceof SocketClosedError,
    ),
  )
}

/**
 * Every ERC-20 that has ever sent to or received from `address` on the
 * current chain. This is the COMPLETE set that `syncTokens` prunes against, so
 * it rejects on any RPC failure instead of returning a partial list.
 */
export async function getAccountTokens(
  client: Client,
  {
    address,
    toBlock,
  }: {
    address: Address
    toBlock: GetLogsParameters['toBlock']
  },
) {
  // Scan from block 0: forkBlockNumber is when DevWallet first saw the network, not the fork.
  const fromBlock = 0n
  const effectiveToBlock = toBlock ?? 'latest'
  // Transfer event signature hash (keccak256 of "Transfer(address,address,uint256)")
  const transferEventSignature =
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as const

  // Pad address to 32 bytes for topic matching
  const paddedAddress = `0x000000000000000000000000${address
    .slice(2)
    .toLowerCase()}` as const

  const [transfersFrom, transfersTo] = await Promise.all([
    // Transfers FROM this address: topic[1] = address
    client.getLogs({
      fromBlock,
      toBlock: effectiveToBlock,
      topics: [transferEventSignature, paddedAddress],
    } as any), // Type assertion needed for raw topics API
    // Transfers TO this address: topic[2] = address
    client.getLogs({
      fromBlock,
      toBlock: effectiveToBlock,
      topics: [transferEventSignature, null, paddedAddress],
    } as any), // Type assertion needed for raw topics API
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
      } catch (err) {
        if (isTransportFailure(err)) throw err
        return null
      }
    }),
  )

  return erc20Tokens.filter((token): token is Address => token !== null)
}
