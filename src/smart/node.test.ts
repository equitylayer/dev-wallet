import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { buildChain } from '~/viem'

import { WalletRpcError } from './errors'
import { type Node, connectNode, nodeMethod } from './node'
import { DEV_ACCOUNTS, startAnvil } from './testing/anvil'

let anvil: { rpcUrl: string; stop(): Promise<void> }
let node: Node
beforeAll(async () => {
  anvil = await startAnvil()
  node = await connectNode({ rpcUrl: anvil.rpcUrl })
})
afterAll(() => anvil.stop())

test('detects anvil and its chain id', async () => {
  expect(node.kind).toBe('anvil')
  expect(await node.chainId()).toBe(31337)
})

test('translates cheat methods per node', () => {
  expect(nodeMethod('hardhat', 'anvil_setCode')).toBe('hardhat_setCode')
  expect(nodeMethod('hardhat', 'anvil_getAutomine')).toBe(
    'hardhat_getAutomine',
  )
  expect(nodeMethod('hardhat', 'anvil_impersonateAccount')).toBe(
    'hardhat_impersonateAccount',
  )
  expect(nodeMethod('hardhat', 'evm_mine')).toBe('evm_mine')
  expect(nodeMethod('anvil', 'anvil_setCode')).toBe('anvil_setCode')
  expect(nodeMethod('hardhat', 'eth_call')).toBe('eth_call')
})

test('setCode/getCode round-trip; empty code is 0x', async () => {
  const a = '0x000000000000000000000000000000000000c0de'
  expect(await node.getCode(a)).toBe('0x')
  await node.setCode(a, '0x6000')
  expect(await node.getCode(a)).toBe('0x6000')
})

test('balance, block number and impersonation helpers', async () => {
  const a = '0x000000000000000000000000000000000000b0b0'
  expect(await node.getBalance(a)).toBe(0n)
  await node.setBalance(a, 10n ** 18n)
  expect(await node.getBalance(a)).toBe(10n ** 18n)

  const before = await node.blockNumber()
  await node.request('anvil_mine')
  expect(await node.blockNumber()).toBe(before + 1n)

  // Impersonated accounts can send without a key.
  await node.impersonate(a)
  const hash = await node.request<string>('eth_sendTransaction', [
    { from: a, to: DEV_ACCOUNTS[1], value: '0x1' },
  ])
  expect(hash).toMatch(/^0x[0-9a-f]{64}$/)
})

test('connectNode is cached per rpc url', async () => {
  expect(await connectNode({ rpcUrl: anvil.rpcUrl })).toBe(node)
})

test('DEV_ACCOUNTS are the accounts anvil exposes', async () => {
  // (impersonated accounts from other tests are listed after the defaults)
  const accounts = (await node.request<string[]>('eth_accounts')).slice(0, 10)
  expect(accounts.map((x) => x.toLowerCase())).toEqual(
    DEV_ACCOUNTS.map((x) => x.toLowerCase()),
  )
})

test('node errors keep their code', async () => {
  const err = (await node
    .request('eth_doesNotExist')
    .catch((e) => e)) as WalletRpcError
  expect(err).toBeInstanceOf(WalletRpcError)
  expect(err.code).toBe(-32601)
})

test.skipIf(!process.env.HARDHAT_RPC_URL)(
  'detects hardhat and setCode works',
  async () => {
    const hh = await connectNode({ rpcUrl: process.env.HARDHAT_RPC_URL! })
    expect(hh.kind).toBe('hardhat')
    await hh.setCode('0x000000000000000000000000000000000000c0de', '0x6000')
    expect(await hh.getCode('0x000000000000000000000000000000000000c0de')).toBe(
      '0x6000',
    )
  },
)

test('buildChain uses the given chain id', () => {
  expect(buildChain({ rpcUrl: 'http://x', chainId: 31337 }).id).toBe(31337)
})

// A stand-in node that records requests, so Hardhat detection and method
// translation are covered without a Hardhat install.
describe('node detection', () => {
  function fakeNode(clientVersion: string) {
    const methods: string[] = []
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const { id, method } = (await req.json()) as {
          id: number
          method: string
        }
        methods.push(method)
        const result = method === 'web3_clientVersion' ? clientVersion : null
        return Response.json({ jsonrpc: '2.0', id, result })
      },
    })
    return { rpcUrl: `http://127.0.0.1:${server.port}`, methods, server }
  }

  test('hardhat (edr) is detected and cheats are translated', async () => {
    const fake = fakeNode('HardhatNetwork/3.0.0/@nomicfoundation/edr-0.12.0')
    try {
      const hh = await connectNode({ rpcUrl: fake.rpcUrl })
      expect(hh.kind).toBe('hardhat')
      await hh.setCode('0x000000000000000000000000000000000000c0de', '0x6000')
      await hh.impersonate('0x000000000000000000000000000000000000c0de')
      expect(fake.methods).toEqual([
        'web3_clientVersion',
        'hardhat_setCode',
        'hardhat_impersonateAccount',
      ])
    } finally {
      await fake.server.stop(true)
    }
  })

  test('unknown clients default to anvil', async () => {
    const fake = fakeNode('SomeOtherNode/1.0.0')
    try {
      const other = await connectNode({ rpcUrl: fake.rpcUrl })
      expect(other.kind).toBe('anvil')
      await other.setCode('0x000000000000000000000000000000000000c0de', '0x')
      expect(fake.methods.at(-1)).toBe('anvil_setCode')
    } finally {
      await fake.server.stop(true)
    }
  })

  test('an unreachable node rejects and is not cached', async () => {
    const fake = fakeNode('anvil/v1.0.0')
    const { rpcUrl } = fake
    await fake.server.stop(true)
    await expect(connectNode({ rpcUrl })).rejects.toThrow()

    // The same URL works once the node is up.
    const revived = Bun.serve({
      port: Number(new URL(rpcUrl).port),
      async fetch(req) {
        const { id } = (await req.json()) as { id: number }
        return Response.json({ jsonrpc: '2.0', id, result: 'anvil/v1.0.0' })
      },
    })
    try {
      expect((await connectNode({ rpcUrl })).kind).toBe('anvil')
    } finally {
      await revived.stop(true)
    }
  })
})
