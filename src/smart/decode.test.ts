import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  type Address,
  type Hex,
  type RpcLog,
  encodeEventTopics,
  encodeFunctionData,
  getAddress,
  parseEther,
  zeroAddress,
} from 'viem'
import { entryPoint07Abi } from 'viem/account-abstraction'

import { DEVWALLET_PAYMASTER, ENTRY_POINT_07, KERNEL_V3_3 } from './constants'
import { USER_OPERATION_EVENT, decodeHandleOps } from './decode'
import { setDelegation } from './kernel'
import { type Node, connectNode } from './node'
import { ensureAaContracts } from './setup'
import { prepareSponsor } from './sponsor'
import { DEV_ACCOUNTS, startAnvil, waitForReceipt } from './testing/anvil'
import {
  handleOpsInput,
  revertReasonLog,
  testOp,
  userOperationEventLog,
} from './testing/entrypoint'
import type { Call } from './types'
import { buildUserOp, signUserOp, submitUserOp } from './userop'

const account = DEV_ACCOUNTS[1]
const X = getAddress('0x00000000000000000000000000000000000a0a0a')
const Y = getAddress('0x00000000000000000000000000000000000b0b0b')
const SPOOF = getAddress('0x0000000000000000000000000000000000005900')

type RpcTransaction = { from: Address; to: Address | null; input: Hex }

describe('decodeHandleOps on Anvil', () => {
  let anvil: { rpcUrl: string; stop(): Promise<void> }
  let node: Node

  beforeAll(async () => {
    anvil = await startAnvil()
    node = await connectNode({ rpcUrl: anvil.rpcUrl })
    await ensureAaContracts(node)
    await setDelegation(node, account, KERNEL_V3_3)
  })
  afterAll(() => anvil.stop())

  test('summarizes a sponsored op with two calls', async () => {
    const calls: Call[] = [
      { to: X, value: parseEther('1'), data: '0x' },
      { to: Y, value: 2n, data: '0xdeadbeef' },
    ]
    const plan = await prepareSponsor(node, { kind: 'devwallet' })
    if (!plan.ok) throw new Error(plan.reason)
    const op = await buildUserOp(node, { sender: account, calls })
    const { signature } = await signUserOp(node, op, await node.chainId())
    const hash = await submitUserOp(node, {
      op: { ...op, signature },
      bundler: plan.sender,
    })
    const receipt = await waitForReceipt(node, hash)
    const tx = await node.request<RpcTransaction>('eth_getTransactionByHash', [
      hash,
    ])

    const summaries = decodeHandleOps(tx, receipt)

    expect(summaries).toHaveLength(1)
    const [summary] = summaries!
    expect(summary).toMatchObject({
      sender: account,
      nonce: 0n,
      success: true,
      paymaster: DEVWALLET_PAYMASTER,
    })
    expect(summary!.actualGasCost).toBeGreaterThan(0n)
    expect(summary!.calls).toEqual(calls)

    // The activity query: the EntryPoint's events whose indexed sender is the
    // account find this transaction.
    const logs = await node.request<RpcLog[]>('eth_getLogs', [
      {
        address: ENTRY_POINT_07,
        fromBlock: '0x0',
        toBlock: 'latest',
        topics: encodeEventTopics({
          abi: [USER_OPERATION_EVENT],
          args: { sender: account },
        }),
      },
    ])
    expect(logs.map((log) => log.transactionHash)).toEqual([hash])
  })

  test('a plain transfer is not handleOps', async () => {
    const hash = await node.request<Hex>('eth_sendTransaction', [
      { from: DEV_ACCOUNTS[0], to: X, value: '0x1' },
    ])
    const receipt = await waitForReceipt(node, hash)
    const tx = await node.request<RpcTransaction>('eth_getTransactionByHash', [
      hash,
    ])
    expect(decodeHandleOps(tx, receipt)).toBeNull()
  })
})

describe('decodeHandleOps', () => {
  const B = DEV_ACCOUNTS[2]
  const handleOps = handleOpsInput([
    testOp({
      sender: account,
      nonce: 7n,
      calls: [{ to: X, value: 1n }],
      paymaster: DEVWALLET_PAYMASTER,
    }),
  ])

  test('matches each op to its own event by sender and nonce', () => {
    const input = handleOpsInput([
      testOp({
        sender: account,
        nonce: 0n,
        calls: [{ to: X, value: 1n }],
        paymaster: DEVWALLET_PAYMASTER,
      }),
      testOp({ sender: B, nonce: 0n, calls: [{ to: X, value: 3n }] }),
      testOp({
        sender: account,
        nonce: 1n,
        calls: [{ to: Y, value: 2n }],
        paymaster: DEVWALLET_PAYMASTER,
      }),
    ])
    // Out of order, with a lookalike event from another contract ahead of the
    // real one for (account, 1), and that op's revert reason.
    const logs = [
      userOperationEventLog({
        address: SPOOF,
        sender: account,
        nonce: 1n,
        success: true,
        actualGasCost: 999n,
        paymaster: DEVWALLET_PAYMASTER,
      }),
      revertReasonLog({ sender: account, nonce: 1n }),
      userOperationEventLog({
        sender: account,
        nonce: 1n,
        success: false,
        actualGasCost: 30n,
        paymaster: DEVWALLET_PAYMASTER,
      }),
      userOperationEventLog({
        sender: B,
        nonce: 0n,
        success: true,
        actualGasCost: 20n,
      }),
      userOperationEventLog({
        sender: account,
        nonce: 0n,
        success: true,
        actualGasCost: 10n,
        paymaster: DEVWALLET_PAYMASTER,
      }),
    ]

    expect(decodeHandleOps({ to: ENTRY_POINT_07, input }, { logs })).toEqual([
      {
        sender: account,
        nonce: 0n,
        success: true,
        actualGasCost: 10n,
        paymaster: DEVWALLET_PAYMASTER,
        calls: [{ to: X, value: 1n, data: '0x' }],
      },
      {
        sender: B,
        nonce: 0n,
        success: true,
        actualGasCost: 20n,
        paymaster: zeroAddress,
        calls: [{ to: X, value: 3n, data: '0x' }],
      },
      {
        sender: account,
        nonce: 1n,
        success: false,
        actualGasCost: 30n,
        paymaster: DEVWALLET_PAYMASTER,
        calls: [{ to: Y, value: 2n, data: '0x' }],
      },
    ])
  })

  test('an op without its event did not run', () => {
    // As when handleOps reverted: no logs.
    expect(
      decodeHandleOps({ to: ENTRY_POINT_07, input: handleOps }, { logs: [] }),
    ).toEqual([
      {
        sender: account,
        nonce: 7n,
        success: false,
        actualGasCost: 0n,
        paymaster: DEVWALLET_PAYMASTER,
        calls: [{ to: X, value: 1n, data: '0x' }],
      },
    ])
  })

  test('calls are null when the op is not a Kernel batch', () => {
    const input = handleOpsInput([
      testOp({ sender: account, nonce: 0n, callData: '0x12345678' }),
    ])
    const [summary] = decodeHandleOps(
      { to: ENTRY_POINT_07, input },
      { logs: [] },
    )!
    expect(summary!.calls).toBeNull()
  })

  test('handleOps sent anywhere but the EntryPoint is null', () => {
    expect(decodeHandleOps({ to: X, input: handleOps }, { logs: [] })).toBeNull()
    expect(
      decodeHandleOps({ to: null, input: handleOps }, { logs: [] }),
    ).toBeNull()
  })

  test('another EntryPoint function is null', () => {
    const input = encodeFunctionData({
      abi: entryPoint07Abi,
      functionName: 'depositTo',
      args: [DEVWALLET_PAYMASTER],
    })
    expect(
      decodeHandleOps({ to: ENTRY_POINT_07, input }, { logs: [] }),
    ).toBeNull()
  })
})
