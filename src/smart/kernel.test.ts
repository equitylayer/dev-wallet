import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  type Address,
  type Hex,
  concat,
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  numberToHex,
  parseAbi,
} from 'viem'

import {
  DELEGATION_PREFIX,
  ERC1271_MAGIC,
  KERNEL_EXECUTE_BATCH_MODE,
  KERNEL_V3_3,
} from './constants'
import {
  classifyCode,
  decodeKernelBatch,
  delegationCode,
  encodeKernelBatch,
  setDelegation,
} from './kernel'
import { type Node, connectNode } from './node'
import { ensureAaContracts } from './setup'
import { DEV_ACCOUNTS, startAnvil } from './testing/anvil'
import type { Call } from './types'

const kernelAbi = parseAbi(['function execute(bytes32 mode, bytes data)'])
const erc1271Abi = parseAbi([
  'function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)',
])

const A = getAddress('0x00000000000000000000000000000000000a0a0a')
const B = getAddress('0x00000000000000000000000000000000000b0b0b')
const REVERTER = getAddress('0x00000000000000000000000000000000000dead0')

describe('encodeKernelBatch / decodeKernelBatch', () => {
  const calls: Call[] = [
    { to: A, value: 1n, data: '0xdeadbeef' },
    { to: B },
    { to: A, data: '0x1234' },
    { to: B, value: 5n },
  ]

  test('encodes Kernel execute(bytes32,bytes) in batch mode', () => {
    const encoded = encodeKernelBatch(calls)
    expect(encoded.startsWith('0xe9ae5c53')).toBe(true)
    const { functionName, args } = decodeFunctionData({
      abi: kernelAbi,
      data: encoded,
    })
    expect(functionName).toBe('execute')
    expect(args[0]).toBe(KERNEL_EXECUTE_BATCH_MODE)
  })

  test('decode(encode(calls)) round-trips with value 0n and data 0x defaults', () => {
    expect(decodeKernelBatch(encodeKernelBatch(calls))).toEqual([
      { to: A, value: 1n, data: '0xdeadbeef' },
      { to: B, value: 0n, data: '0x' },
      { to: A, value: 0n, data: '0x1234' },
      { to: B, value: 5n, data: '0x' },
    ])
  })

  test('refuses a call without a target', () => {
    expect(() => encodeKernelBatch([{ value: 1n }])).toThrow('needs a `to`')
  })

  test('decodes an empty batch', () => {
    expect(decodeKernelBatch(encodeKernelBatch([]))).toEqual([])
  })

  test('returns null for calldata that is not a batch execute', () => {
    expect(decodeKernelBatch('0x')).toBeNull()
    expect(decodeKernelBatch('0xdeadbeef')).toBeNull()
    // Right selector, single-call mode (callType 0x00).
    const single = encodeFunctionData({
      abi: kernelAbi,
      functionName: 'execute',
      args: [`0x${'00'.repeat(32)}`, '0x'],
    })
    expect(decodeKernelBatch(single)).toBeNull()
  })

  test('returns null for a batch execute with malformed calldata', () => {
    const malformed = encodeFunctionData({
      abi: kernelAbi,
      functionName: 'execute',
      args: [KERNEL_EXECUTE_BATCH_MODE, '0x1234'],
    })
    expect(decodeKernelBatch(malformed)).toBeNull()
  })
})

describe('delegationCode / classifyCode', () => {
  test('delegationCode is the 7702 prefix followed by the target', () => {
    expect(delegationCode(KERNEL_V3_3)).toBe(
      '0xef0100d6cedde84be40893d153be9d467cd6ad37875b28',
    )
    expect(delegationCode(KERNEL_V3_3).startsWith(DELEGATION_PREFIX)).toBe(true)
  })

  test('empty code is an EOA', () => {
    expect(classifyCode('0x')).toEqual({ kind: 'eoa' })
  })

  test('Kernel delegation is recognized case-insensitively', () => {
    const upper = delegationCode(KERNEL_V3_3).toUpperCase() as Hex
    expect(classifyCode(upper)).toEqual({ kind: 'kernel' })
  })

  test('another delegation target is reported as delegated', () => {
    const target = '0x1111111111111111111111111111111111111111'
    expect(classifyCode(delegationCode(target))).toEqual({
      kind: 'delegated',
      target,
    })
  })

  test('other non-empty code is a contract', () => {
    expect(classifyCode('0x6080')).toEqual({ kind: 'contract' })
    // Starts like a delegation but has the wrong length.
    expect(classifyCode('0xef0100')).toEqual({ kind: 'contract' })
    expect(classifyCode(`${delegationCode(A)}00`)).toEqual({
      kind: 'contract',
    })
  })
})

describe('on a real node', () => {
  let anvil: { rpcUrl: string; stop(): Promise<void> }
  let node: Node
  const account = DEV_ACCOUNTS[1]

  beforeEach(async () => {
    anvil = await startAnvil()
    node = await connectNode({ rpcUrl: anvil.rpcUrl })
    await ensureAaContracts(node)
    await setDelegation(node, account, KERNEL_V3_3)
  })
  afterEach(() => anvil.stop())

  async function sendFrom(
    from: Address,
    to: Address,
    data: Hex,
    gas?: bigint,
  ): Promise<'success' | 'reverted'> {
    const hash = await node.request<Hex>('eth_sendTransaction', [
      {
        from,
        to,
        data,
        ...(gas !== undefined && { gas: numberToHex(gas) }),
      },
    ])
    return (await waitForReceipt(hash)).status === '0x1'
      ? 'success'
      : 'reverted'
  }

  // Anvil answers `eth_sendTransaction` before the block is queryable.
  async function waitForReceipt(hash: Hex): Promise<{ status: Hex }> {
    for (let attempt = 0; attempt < 100; attempt++) {
      const receipt = await node.request<{ status: Hex } | null>(
        'eth_getTransactionReceipt',
        [hash],
      )
      if (receipt) return receipt
      await Bun.sleep(20)
    }
    throw new Error(`no receipt for ${hash}`)
  }

  test('setDelegation installs Kernel delegation code', async () => {
    expect(await node.getCode(account)).toBe(delegationCode(KERNEL_V3_3))
    expect(classifyCode(await node.getCode(account))).toEqual({
      kind: 'kernel',
    })
  })

  test('setDelegation(null) clears the delegation', async () => {
    await setDelegation(node, account, null)
    expect(await node.getCode(account)).toBe('0x')
  })

  test('self-call batch is atomic and applies all calls', async () => {
    const [balanceA, balanceB] = [
      await node.getBalance(A),
      await node.getBalance(B),
    ]
    const status = await sendFrom(
      account,
      account,
      encodeKernelBatch([
        { to: A, value: 1n },
        { to: B, value: 2n },
      ]),
    )
    expect(status).toBe('success')
    expect(await node.getBalance(A)).toBe(balanceA + 1n)
    expect(await node.getBalance(B)).toBe(balanceB + 2n)
  })

  test('a failing call reverts the whole batch', async () => {
    await node.setCode(REVERTER, '0x5f5ffd')
    const balanceA = await node.getBalance(A)
    // Explicit gas: Anvil refuses to send a transaction whose estimate reverts.
    const status = await sendFrom(
      account,
      account,
      encodeKernelBatch([{ to: A, value: 1n }, { to: REVERTER }]),
      1_000_000n,
    )
    expect(status).toBe('reverted')
    expect(await node.getBalance(A)).toBe(balanceA)
  })

  test('impersonated EOAs can self-call', async () => {
    const impersonated = '0x00000000000000000000000000000000000c1c1c'
    await node.setBalance(impersonated, 10n ** 18n)
    await node.impersonate(impersonated)
    await setDelegation(node, impersonated, KERNEL_V3_3)
    const balanceA = await node.getBalance(A)
    const status = await sendFrom(
      impersonated,
      impersonated,
      encodeKernelBatch([{ to: A, value: 3n }]),
    )
    expect(status).toBe('success')
    expect(await node.getBalance(A)).toBe(balanceA + 3n)
  })

  test('Kernel ERC-1271 accepts d1-style wrapped signatures', async () => {
    const hash: Hex = `0x${'ab'.repeat(32)}`
    const typedData = {
      domain: {
        name: 'Kernel',
        version: '0.3.3',
        chainId: 31337,
        verifyingContract: account,
      },
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        Kernel: [{ name: 'hash', type: 'bytes32' }],
      },
      primaryType: 'Kernel',
      message: { hash },
    }
    const signature = await node.request<Hex>('eth_signTypedData_v4', [
      account,
      JSON.stringify(typedData),
    ])

    const isValidSignature = async (sig: Hex): Promise<Hex | 'reverted'> => {
      try {
        return await node.request<Hex>('eth_call', [
          {
            to: account,
            data: encodeFunctionData({
              abi: erc1271Abi,
              functionName: 'isValidSignature',
              args: [hash, sig],
            }),
          },
          'latest',
        ])
      } catch {
        return 'reverted'
      }
    }

    // d1 prefixes the root validator id (0x00) to the ECDSA signature.
    const wrapped = await isValidSignature(concat(['0x00', signature]))
    expect(wrapped.slice(0, 10)).toBe(ERC1271_MAGIC)
    // The raw signature is not accepted.
    const raw = await isValidSignature(signature)
    expect(raw === 'reverted' || raw.slice(0, 10) !== ERC1271_MAGIC).toBe(true)
  })
})
