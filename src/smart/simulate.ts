import {
  type Address,
  type Hex,
  decodeErrorResult,
  getAddress,
  hexToBigInt,
  isAddressEqual,
  isHex,
  size,
  slice,
  toEventSelector,
} from 'viem'

import { WalletRpcError } from './errors'
import { encodeKernelBatch } from './kernel'
import type { Node } from './node'
import { type Call, toRpcCall } from './types'

export type BalanceChange = { token: Address | 'native'; delta: bigint }

export type SimulationResult =
  | {
      ok: true
      /** Sum of the calls' gas; `null` when the node can't simulate. */
      gasUsed: bigint | null
      /** Net changes to the account; `null` when the node can't simulate. */
      balanceChanges: BalanceChange[] | null
    }
  | {
      ok: false
      /** Index of the first failing call; `null` when it isn't known. */
      failedIndex: number | null
      revertData: Hex | null
      message: string
    }

type SimulatedCall = {
  status: Hex
  gasUsed: Hex
  returnData: Hex
  logs?: { address: Address; topics: Hex[]; data: Hex }[]
}

/** `eth_simulateV1` (`traceTransfers`) logs native transfers from this address. */
const NATIVE_TRANSFER_EMITTER = getAddress(
  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
)
const TRANSFER_TOPIC = toEventSelector('Transfer(address,address,uint256)')

const PANIC_REASONS: Record<number, string> = {
  0x01: 'assertion failed',
  0x11: 'arithmetic overflow or underflow',
  0x12: 'division or modulo by zero',
  0x32: 'array index out of bounds',
}

/** How long a node stays marked as lacking `eth_simulateV1` before we retry. */
export const UNSUPPORTED_RETRY_MS = 60_000

// When each rpc url was last found to lack `eth_simulateV1`.
const unsupportedSince = new Map<string, number>()

function knownUnsupported(rpcUrl: string): boolean {
  const since = unsupportedSince.get(rpcUrl)
  return since !== undefined && Date.now() - since < UNSUPPORTED_RETRY_MS
}

const MISSING_METHOD = /not found|not supported|unsupported|does not exist/i

/**
 * Only a "method not found" code, or a message that names `eth_simulateV1`
 * itself, counts: any other error must not switch the method off for the url.
 */
function isMissingMethod(e: unknown): boolean {
  return (
    e instanceof WalletRpcError &&
    (e.code === -32601 ||
      (e.message.includes('eth_simulateV1') && MISSING_METHOD.test(e.message)))
  )
}

/** Revert data in a node's error: a hex string, or hex under `data.data`. */
function revertDataOf(e: WalletRpcError): Hex | null {
  const { data } = e
  if (isHex(data)) return data
  if (typeof data === 'object' && data !== null && 'data' in data)
    return isHex(data.data) ? data.data : null
  return null
}

/** What a revert says, if it's an `Error(string)` or a `Panic(uint256)`. */
function revertReason(data: Hex | null): string | null {
  if (!data || data === '0x') return null
  try {
    const { errorName, args } = decodeErrorResult({ data })
    if (errorName === 'Error') return String(args?.[0])
    if (errorName === 'Panic') {
      const code = Number(args?.[0])
      return PANIC_REASONS[code] ?? `panic code 0x${code.toString(16)}`
    }
  } catch {
    // Not a standard error: fall through to the selector.
  }
  return `custom error ${slice(data, 0, 4)}`
}

function failure(
  subject: string,
  failedIndex: number | null,
  revertData: Hex | null,
): SimulationResult {
  const reason = revertReason(revertData)
  return {
    ok: false,
    failedIndex,
    revertData,
    message: `${subject} reverted${reason ? `: ${reason}` : ''}`,
  }
}

/** A node error that says nothing about the calls themselves. */
function nodeError(e: WalletRpcError): SimulationResult {
  const data = revertDataOf(e)
  return {
    ok: false,
    failedIndex: null,
    revertData: data === '0x' ? null : data,
    message: e.message,
  }
}

/** `eth_call` reports a revert with code 3 and/or the revert data. */
function ethCallFailure(
  subject: string,
  failedIndex: number | null,
  e: WalletRpcError,
): SimulationResult {
  const data = revertDataOf(e)
  return e.code === 3 || (data !== null && data !== '0x')
    ? failure(subject, failedIndex, data)
    : nodeError(e)
}

/** Net change per token to `account`, from ERC-20 and native transfer logs. */
function balanceChanges(
  account: Address,
  calls: readonly SimulatedCall[],
): BalanceChange[] {
  const deltas = new Map<Address | 'native', bigint>()
  for (const { logs = [] } of calls) {
    for (const log of logs) {
      // ERC-721's `Transfer` shares the topic but indexes the id (4 topics).
      if (log.topics.length !== 3 || log.topics[0] !== TRANSFER_TOPIC) continue
      // A malformed amount is skipped rather than guessed at.
      if (size(log.data) !== 32) continue
      const amount = hexToBigInt(log.data)
      const from = getAddress(slice(log.topics[1] as Hex, 12))
      const to = getAddress(slice(log.topics[2] as Hex, 12))
      const token = isAddressEqual(log.address, NATIVE_TRANSFER_EMITTER)
        ? 'native'
        : getAddress(log.address)
      let delta = 0n
      if (isAddressEqual(from, account)) delta -= amount
      if (isAddressEqual(to, account)) delta += amount
      if (delta !== 0n) deltas.set(token, (deltas.get(token) ?? 0n) + delta)
    }
  }
  return [...deltas]
    .filter(([, delta]) => delta !== 0n)
    .map(([token, delta]) => ({ token, delta }))
}

async function simulateV1(
  node: Node,
  from: Address,
  atomic: boolean,
  calls: readonly Call[],
): Promise<SimulationResult> {
  // Blocks in one request build on each other, so a call that must not see the
  // others' effects gets a request (and a block) of its own.
  const groups = atomic ? [calls] : calls.map((call) => [call])
  const simulated: SimulatedCall[] = []
  for (const group of groups) {
    const blocks = await node.request<
      { calls?: SimulatedCall[] }[] | null
    >('eth_simulateV1', [
      {
        blockStateCalls: [
          { calls: group.map((call) => ({ from, ...toRpcCall(call) })) },
        ],
        traceTransfers: true,
        validation: false,
      },
      'latest',
    ])
    const results = blocks?.[0]?.calls
    // Never report success for results that don't line up with the calls.
    if (!Array.isArray(results) || results.length !== group.length) {
      return {
        ok: false,
        failedIndex: null,
        revertData: null,
        message: `eth_simulateV1 returned ${Array.isArray(results) ? results.length : 'no'} call results for ${group.length} calls`,
      }
    }
    simulated.push(...results)
    if (simulated.some((call) => call.status === '0x0')) break
  }

  const failedIndex = simulated.findIndex((call) => call.status === '0x0')
  if (failedIndex !== -1) {
    const { returnData } = simulated[failedIndex] as SimulatedCall
    return failure(`Call ${failedIndex + 1}`, failedIndex, returnData)
  }
  return {
    ok: true,
    gasUsed: simulated.reduce((sum, c) => sum + hexToBigInt(c.gasUsed), 0n),
    balanceChanges: balanceChanges(from, simulated),
  }
}

async function ethCall(
  node: Node,
  call: Call & { from: Address },
): Promise<WalletRpcError | null> {
  try {
    await node.request('eth_call', [
      { ...toRpcCall(call), from: call.from },
      'latest',
    ])
    return null
  } catch (e) {
    if (e instanceof WalletRpcError) return e
    throw e
  }
}

async function simulateWithEthCall(
  node: Node,
  from: Address,
  atomic: boolean,
  calls: readonly Call[],
): Promise<SimulationResult> {
  const ok: SimulationResult = {
    ok: true,
    gasUsed: null,
    balanceChanges: null,
  }
  if (atomic) {
    // The account runs its own batch, so it has to be Kernel-delegated. Kernel
    // doesn't say which call failed.
    if (calls.some((call) => call.to === undefined)) {
      return {
        ok: false,
        failedIndex: null,
        revertData: null,
        message:
          'This node cannot simulate an atomic batch that includes a contract deployment',
      }
    }
    let data: Hex
    try {
      data = encodeKernelBatch(calls)
    } catch (e) {
      return {
        ok: false,
        failedIndex: null,
        revertData: null,
        message: e instanceof Error ? e.message : String(e),
      }
    }
    const error = await ethCall(node, { from, to: from, data })
    return error ? ethCallFailure('Batch', null, error) : ok
  }

  for (const [index, call] of calls.entries()) {
    const error = await ethCall(node, { ...call, from })
    if (error) return ethCallFailure(`Call ${index + 1}`, index, error)
  }
  return ok
}

/**
 * Predicts whether `calls` would succeed when sent from `from`, without mining
 * anything. Calls are simulated as `from`'s own, so no real sender setup is
 * needed. `atomic` calls share state and run together; otherwise each runs
 * alone against the current state.
 *
 * Nodes with `eth_simulateV1` also report gas and balance changes. Others fall
 * back to `eth_call`, which only answers whether the batch reverts.
 */
export async function simulateCalls(
  node: Node,
  args: { from: Address; atomic: boolean; calls: readonly Call[] },
): Promise<SimulationResult> {
  const { from, atomic, calls } = args
  if (!knownUnsupported(node.rpcUrl)) {
    try {
      return await simulateV1(node, from, atomic, calls)
    } catch (e) {
      if (isMissingMethod(e)) unsupportedSince.set(node.rpcUrl, Date.now())
      else if (e instanceof WalletRpcError) return nodeError(e)
      else throw e
    }
  }
  return simulateWithEthCall(node, from, atomic, calls)
}
