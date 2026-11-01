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

  // Anvil and Hardhat on the same url, one after the other: each refuses the
  // other's cheats (Anvil -32601, Hardhat 3 -32004 "is not supported").
  function switchingNode() {
    const anvil = 'anvil/v1.7.1'
    const hardhat = 'HardhatNetwork/3.21.2/@nomicfoundation/edr/0.3.8'
    const state = { clientVersion: anvil, methods: [] as string[] }
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const { id, method } = (await req.json()) as {
          id: number
          method: string
        }
        state.methods.push(method)
        if (method === 'web3_clientVersion')
          return Response.json({ jsonrpc: '2.0', id, result: state.clientVersion })
        const isHardhat = state.clientVersion === hardhat
        const foreign = isHardhat
          ? method.startsWith('anvil_')
          : method.startsWith('hardhat_')
        if (foreign)
          return Response.json({
            jsonrpc: '2.0',
            id,
            error: isHardhat
              ? { code: -32004, message: `Method ${method} is not supported` }
              : { code: -32601, message: 'Method not found' },
          })
        return Response.json({ jsonrpc: '2.0', id, result: null })
      },
    })
    return {
      rpcUrl: `http://127.0.0.1:${server.port}`,
      server,
      state,
      becomeHardhat: () => void (state.clientVersion = hardhat),
      becomeAnvil: () => void (state.clientVersion = anvil),
    }
  }
  const A = '0x000000000000000000000000000000000000c0de'

  test('a node that turns into Hardhat on the same url is detected again at its first refused cheat', async () => {
    const fake = switchingNode()
    try {
      const node = await connectNode({ rpcUrl: fake.rpcUrl })
      expect(node.kind).toBe('anvil')

      fake.becomeHardhat()
      fake.state.methods.length = 0
      await node.setCode(A, '0x6000')
      expect(fake.state.methods).toEqual([
        'anvil_setCode',
        'web3_clientVersion',
        'hardhat_setCode',
      ])
      expect(node.kind).toBe('hardhat')
      // Everyone holding the node, and the cache, sees the new kind.
      expect(await connectNode({ rpcUrl: fake.rpcUrl })).toBe(node)

      fake.state.methods.length = 0
      await node.request('anvil_mine')
      expect(fake.state.methods).toEqual(['hardhat_mine'])

      // And back: Anvil refuses hardhat_* here.
      fake.becomeAnvil()
      fake.state.methods.length = 0
      await node.impersonate(A)
      expect(fake.state.methods).toEqual([
        'hardhat_impersonateAccount',
        'web3_clientVersion',
        'anvil_impersonateAccount',
      ])
      expect(node.kind).toBe('anvil')
    } finally {
      await fake.server.stop(true)
    }
  })

  test("a page's cheat passed through is retried the same way; otherwise its error is the node's own", async () => {
    const fake = switchingNode()
    try {
      const node = await connectNode({ rpcUrl: fake.rpcUrl })
      fake.becomeHardhat()
      fake.state.methods.length = 0
      expect(
        await node.forward({ jsonrpc: '2.0', id: 9, method: 'anvil_mine' }),
      ).toEqual({ jsonrpc: '2.0', id: 9, result: null })
      expect(fake.state.methods).toEqual([
        'anvil_mine',
        'web3_clientVersion',
        'hardhat_mine',
      ])

      // Not a cheat the kind decides: passed on as it is, error and all.
      fake.state.methods.length = 0
      expect(
        await node.forward({ jsonrpc: '2.0', id: 10, method: 'anvil_dumpState' }),
      ).toMatchObject({ id: 10, error: { code: -32004 } })
      expect(fake.state.methods).toEqual(['anvil_dumpState'])
    } finally {
      await fake.server.stop(true)
    }
  })

  test('concurrent refused cheats are each sent again once, as the new kind', async () => {
    const fake = switchingNode()
    try {
      const node = await connectNode({ rpcUrl: fake.rpcUrl })
      fake.becomeHardhat()
      fake.state.methods.length = 0
      await Promise.all([node.setCode(A, '0x6000'), node.setBalance(A, 1n)])
      expect(fake.state.methods.filter((m) => m.startsWith('hardhat_')).sort())
        .toEqual(['hardhat_setBalance', 'hardhat_setCode'])
    } finally {
      await fake.server.stop(true)
    }
  })

  test('a refused cheat on a node that is still the same kind is not retried', async () => {
    const fake = switchingNode()
    try {
      const node = await connectNode({ rpcUrl: fake.rpcUrl })
      fake.state.methods.length = 0
      const error = (await node
        .request('hardhat_setCode', [A, '0x'])
        .catch((e) => e)) as WalletRpcError
      // `hardhat_*` is never translated, so the kind can't be why.
      expect(error.code).toBe(-32601)
      expect(fake.state.methods).toEqual(['hardhat_setCode'])
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
