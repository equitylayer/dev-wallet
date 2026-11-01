import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createWalletClient, custom, getAddress } from 'viem'
import {
  getCapabilities,
  sendCalls,
  waitForCallsStatus,
} from 'viem/actions'
import { foundry } from 'viem/chains'

import { type Node, connectNode } from './node'
import { reconcileAccounts } from './modes'
import { DEV_ACCOUNTS, startAnvil } from './testing/anvil'
import { createTestWallet } from './testing/wallet'

const account = DEV_ACCOUNTS[1]
const X = getAddress('0x00000000000000000000000000000000000a0a0a')
const Y = getAddress('0x00000000000000000000000000000000000b0b0b')
const R = getAddress('0x00000000000000000000000000000000000dead0')
// Runtime code that reverts with the 4 bytes `0xdeadbeef`.
const REVERTER_CODE = '0x63deadbeef5f526004601cfd'

let anvil: { rpcUrl: string; stop(): Promise<void> }
let node: Node
let client: ReturnType<typeof makeClient>

function makeClient(wallet: ReturnType<typeof createTestWallet>) {
  return createWalletClient({
    chain: foundry,
    transport: custom(wallet),
    // Anvil mines at once, so don't wait the default 4 s between polls.
    pollingInterval: 50,
  })
}

beforeEach(async () => {
  anvil = await startAnvil()
  node = await connectNode({ rpcUrl: anvil.rpcUrl })
  await node.setCode(R, REVERTER_CODE)
  const {
    accounts: [reconciled],
  } = await reconcileAccounts(node, [{ address: account, mode: 'smart' }])

  client = makeClient(
    createTestWallet({
      node,
      rpcUrl: anvil.rpcUrl,
      chainId: await node.chainId(),
      activeAccount: account,
      accounts: [
        {
          address: account,
          mode: 'smart',
          onchain: reconciled?.onchain ?? { kind: 'eoa' },
          canSign: true,
        },
      ],
      sponsor: { kind: 'devwallet' },
    }),
  )
})
afterEach(() => anvil.stop())

describe('viem against the test wallet', () => {
  test('getCapabilities reports atomic support for the chain', async () => {
    const capabilities = await getCapabilities(client, {
      account,
      chainId: 31337,
    })
    expect(capabilities.atomic?.status).toBe('supported')
  })

  test('sendCalls and waitForCallsStatus run an atomic batch', async () => {
    const { id } = await sendCalls(client, {
      account,
      forceAtomic: true,
      calls: [
        { to: X, value: 1n },
        { to: Y, value: 2n },
      ],
    })
    const res = await waitForCallsStatus(client, { id })

    expect(res.status).toBe('success')
    expect(res.atomic).toBe(true)
    expect(res.receipts).toHaveLength(1)
    expect(res.receipts?.[0]?.status).toBe('success')
    expect(await node.getBalance(X)).toBe(1n)
    expect(await node.getBalance(Y)).toBe(2n)
  })

  test('a call that would revert is refused with code 3', async () => {
    const err = await sendCalls(client, {
      account,
      forceAtomic: true,
      calls: [{ to: R }],
    }).catch((e: any) => e)

    expect(err.walk((e: any) => e?.code === 3)).toBeTruthy()
    expect(err.walk((e: any) => e?.code === 3).data).toBe('0xdeadbeef')
  })
})
