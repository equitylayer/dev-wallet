import type { Address, GetLogsParameters } from 'viem'
import {
  AbiDecodingDataSizeInvalidError,
  AbiDecodingDataSizeTooSmallError,
  AbiDecodingZeroDataError,
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  erc20Abi,
} from 'viem'

import type { Client } from '~/viem'

// A call that reverted, returned nothing or returned undecodable data says
// "this address is not an ERC-20". Anything else (HTTP, timeout, ...) says
// nothing about the token, so the caller must not treat it as a verdict.
function isNotAnErc20(err: unknown) {
  if (!(err instanceof BaseError)) return false
  return Boolean(
    err.walk(
      (e) =>
        e instanceof ContractFunctionRevertedError ||
        e instanceof ContractFunctionZeroDataError ||
        e instanceof AbiDecodingZeroDataError ||
        e instanceof AbiDecodingDataSizeTooSmallError ||
        e instanceof AbiDecodingDataSizeInvalidError,
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
        if (isNotAnErc20(err)) return null
        throw err
      }
    }),
  )

  return erc20Tokens.filter((token): token is Address => token !== null)
}
