import { describe, expect, test } from 'bun:test'
import {
  type Address,
  HttpRequestError,
  RpcRequestError,
  createPublicClient,
  custom,
  encodeAbiParameters,
  pad,
} from 'viem'

import type { Client } from '~/viem'
import { getAccountTokens } from './getAccountTokens'

const account = '0x1111111111111111111111111111111111111111' as Address
const TOKEN_OK = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const TOKEN_REVERTS = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const TOKEN_EOA = '0xcccccccccccccccccccccccccccccccccccccccc' as Address
const TOKEN_DOWN = '0xdddddddddddddddddddddddddddddddddddddddd' as Address

const log = (address: Address) => ({
  address,
  blockHash: pad('0x1'),
  blockNumber: '0x1',
  data: '0x',
  logIndex: '0x0',
  removed: false,
  topics: [],
  transactionHash: pad('0x2'),
  transactionIndex: '0x0',
})

const decimals18 = encodeAbiParameters([{ type: 'uint8' }], [18])

type Handlers = {
  getLogs?: (params: any) => unknown
  call?: (to: Address) => unknown
}

// A real viem client over a canned JSON-RPC transport, so the actual viem
// error types (revert, zero data, HTTP) come out of `readContract`.
function makeClient({ getLogs, call }: Handlers) {
  const calls: { method: string; params: any }[] = []
  const client = createPublicClient({
    transport: custom(
      {
        async request({ method, params }) {
          calls.push({ method, params })
          if (method === 'eth_getLogs')
            return getLogs ? getLogs(params[0]) : []
          if (method === 'eth_call') return call?.(params[0].to)
          throw new Error(`unexpected ${method}`)
        },
      },
      { retryCount: 0 },
    ),
  }) as unknown as Client
  return { client, calls }
}

const revert = () =>
  new RpcRequestError({
    body: {},
    url: 'http://localhost:8545',
    error: { code: 3, message: 'execution reverted', data: '0x' },
  })

describe('getAccountTokens', () => {
  test('scans logs from block 0 regardless of the network fork block', async () => {
    const { client, calls } = makeClient({})
    await getAccountTokens(client, { address: account, toBlock: 'latest' })
    const scans = calls.filter((x) => x.method === 'eth_getLogs')
    expect(scans).toHaveLength(2)
    for (const scan of scans) expect(scan.params[0].fromBlock).toBe('0x0')
  })

  test('returns tokens whose decimals() answers, lowercased and deduped', async () => {
    const { client } = makeClient({
      getLogs: () => [log(TOKEN_OK), log(TOKEN_OK)],
      call: () => decimals18,
    })
    expect(
      await getAccountTokens(client, { address: account, toBlock: 'latest' }),
    ).toEqual([TOKEN_OK])
  })

  test('skips contracts that revert and addresses with no code', async () => {
    const { client } = makeClient({
      getLogs: () => [log(TOKEN_OK), log(TOKEN_REVERTS), log(TOKEN_EOA)],
      call: (to) => {
        if (to === TOKEN_OK) return decimals18
        if (to === TOKEN_REVERTS) throw revert()
        return '0x'
      },
    })
    expect(
      await getAccountTokens(client, { address: account, toBlock: 'latest' }),
    ).toEqual([TOKEN_OK])
  })

  test('skips a revert whatever error code the node reports it with', async () => {
    const { client } = makeClient({
      getLogs: () => [log(TOKEN_OK), log(TOKEN_REVERTS)],
      call: (to) => {
        if (to === TOKEN_OK) return decimals18
        // geth-style: -32000 and no data, not code 3
        throw new RpcRequestError({
          body: {},
          url: 'http://localhost:8545',
          error: { code: -32000, message: 'execution reverted' },
        })
      },
    })
    expect(
      await getAccountTokens(client, { address: account, toBlock: 'latest' }),
    ).toEqual([TOKEN_OK])
  })

  test('rejects when getLogs fails, so a failed scan cannot look like "no tokens"', async () => {
    const { client } = makeClient({
      getLogs: () => {
        throw new HttpRequestError({ url: 'http://localhost:8545' })
      },
    })
    await expect(
      getAccountTokens(client, { address: account, toBlock: 'latest' }),
    ).rejects.toThrow()
  })

  test('rejects on a transport error during the decimals probe', async () => {
    const { client } = makeClient({
      getLogs: () => [log(TOKEN_OK), log(TOKEN_DOWN)],
      call: (to) => {
        if (to === TOKEN_OK) return decimals18
        throw new HttpRequestError({ url: 'http://localhost:8545' })
      },
    })
    await expect(
      getAccountTokens(client, { address: account, toBlock: 'latest' }),
    ).rejects.toThrow()
  })
})
