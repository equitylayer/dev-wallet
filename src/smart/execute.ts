import { type Address, type Hash, type Hex, numberToHex } from 'viem'

import { WalletRpcError } from './errors'
import { encodeKernelBatch } from './kernel'
import { atomicStatus } from './modes'
import type { Node } from './node'
import {
  type SimulationResult,
  ethCall,
  ethCallFailure,
  simulateCalls,
} from './simulate'
import { assessSponsor, isKnownToNode, prepareSponsor } from './sponsor'
import {
  type AccountMode,
  type Call,
  type OnchainKind,
  type SponsorSetting,
  toRpcCall,
} from './types'
import { buildUserOp, signUserOp, submitUserOp } from './userop'

export type ExecutionPath = 'userop' | 'self-call' | 'sequential' | 'deploy'

export type ExecuteInput = {
  node: Node
  chainId: number
  account: {
    address: Address
    mode: AccountMode
    onchain: OnchainKind
    /** Whether the node holds the account's key, so it can sign a user op. */
    canSign: boolean
  }
  calls: readonly Call[]
  atomicRequired: boolean
  sponsor: SponsorSetting
  /** Send even though the simulation failed (the transaction then reverts). */
  force?: boolean
}

export type ExecutionPlan = {
  path: ExecutionPath
  /** Who pays the gas: the sponsor for a user op, otherwise the account. */
  payer: Address
  sponsored: boolean
  /** Why sponsorship was asked for but not used. */
  fallbackReason?: string
  simulation: SimulationResult
}

export type ExecutionResult = ExecutionPlan & {
  /** One hash, except `sequential`, which has one per call. */
  transactionHashes: Hash[]
  /** Only for `userop`. */
  userOpHash?: Hex
}

const INVALID_PARAMS = -32602
const EXECUTION_REVERTED = 3
const ATOMICITY_NOT_SUPPORTED = 5760

const IMPERSONATED_REASON =
  "Impersonated accounts can't sign, so they pay their own gas."
const FORCED_REASON =
  'The call is expected to revert, so it is not sponsored: you pay for it.'

// A transaction that is expected to revert gets this gas limit. Without one,
// Anvil estimates, sees the revert, and refuses it (or mines it at the block
// gas limit). A failed simulation has no gas figure to scale, so it is fixed.
const REVERTING_GAS_LIMIT = 1_000_000n

/** A plan whose transactions are all sent by the account itself. */
type SelfPaidPlan = ExecutionPlan & { path: Exclude<ExecutionPath, 'userop'> }

function selfPaid(
  path: SelfPaidPlan['path'],
  account: Address,
  simulation: SimulationResult,
  fallbackReason?: string,
): SelfPaidPlan {
  return {
    path,
    payer: account,
    sponsored: false,
    ...(fallbackReason !== undefined && { fallbackReason }),
    simulation,
  }
}

/** Anvil rejects creations in `eth_simulateV1`, so a deploy uses `eth_call`. */
async function simulateDeploy(
  node: Node,
  from: Address,
  call: Call,
): Promise<SimulationResult> {
  const error = await ethCall(node, { ...call, from })
  return error
    ? ethCallFailure('Deployment', 0, error)
    : { ok: true, gasUsed: null, balanceChanges: null }
}

/** A send whose simulation failed is refused unless `force` says otherwise. */
function refuseFailure(simulation: SimulationResult, force?: boolean): void {
  if (!simulation.ok && !force) {
    throw new WalletRpcError(
      EXECUTION_REVERTED,
      simulation.message,
      simulation.revertData ?? undefined,
    )
  }
}

/**
 * Decides how `calls` would be executed, without sending anything: no
 * transaction, balance change or impersonation. The rules apply in order:
 *
 * 0. There must be at least one call.
 * 1. A call without `to` is a deployment, and it can't join a batch.
 * 2. An account that can't batch atomically sends one transaction per call.
 * 3. A failing simulation is refused, unless `force` is set.
 * 4. A forced failing call is a self-call, so it reverts on chain.
 * 5. Sponsorship off, an account that can't sign, or a sponsor that can't pay
 *    make it a self-call by the account (`fallbackReason` says which, except
 *    for off).
 * 6. Otherwise it is a user op paid by the sponsor.
 *
 * @throws WalletRpcError `-32602` for no calls or a deployment in a batch,
 * `5760` when atomicity is required but unavailable, `3` for a failing
 * simulation.
 */
export async function planExecution(
  input: ExecuteInput,
): Promise<ExecutionPlan> {
  const { node, account, calls, atomicRequired, sponsor, force } = input
  const from = account.address

  if (calls.length === 0) {
    throw new WalletRpcError(INVALID_PARAMS, 'There are no calls to execute')
  }

  if (calls.some((call) => call.to === undefined)) {
    if (calls.length > 1) {
      throw new WalletRpcError(
        INVALID_PARAMS,
        'A contract deployment (a call without `to`) cannot be part of a batch',
      )
    }
    const simulation = await simulateDeploy(node, from, calls[0] as Call)
    refuseFailure(simulation, force)
    return selfPaid('deploy', from, simulation)
  }

  if (atomicStatus(account.mode, account.onchain) !== 'supported') {
    if (atomicRequired) {
      throw new WalletRpcError(
        ATOMICITY_NOT_SUPPORTED,
        "This account can't execute calls atomically",
      )
    }
    const simulation = await simulateCalls(node, {
      from,
      atomic: false,
      calls,
    })
    refuseFailure(simulation, force)
    return selfPaid('sequential', from, simulation)
  }

  const simulation = await simulateCalls(node, { from, atomic: true, calls })
  refuseFailure(simulation, force)
  // Never sponsor a call that is expected to revert: the `handleOps`
  // transaction would succeed anyway and hide the failure.
  if (!simulation.ok) {
    return selfPaid(
      'self-call',
      from,
      simulation,
      sponsor.kind === 'off' ? undefined : FORCED_REASON,
    )
  }

  if (sponsor.kind === 'off') return selfPaid('self-call', from, simulation)
  if (!account.canSign) {
    return selfPaid('self-call', from, simulation, IMPERSONATED_REASON)
  }
  const sponsorPlan = await assessSponsor(node, sponsor)
  if (!sponsorPlan.ok) {
    return selfPaid('self-call', from, simulation, sponsorPlan.reason)
  }
  return {
    path: 'userop',
    payer: sponsorPlan.sender,
    sponsored: true,
    simulation,
  }
}

/** The gas to send with a call the simulation expects to revert, if any. */
function revertingGas(
  simulation: SimulationResult,
  index?: number,
): { gas?: Hex } {
  if (simulation.ok) return {}
  const { failedIndex } = simulation
  if (index !== undefined && failedIndex !== null && failedIndex !== index) {
    return {}
  }
  return { gas: numberToHex(REVERTING_GAS_LIMIT) }
}

async function sendUserOp(
  input: ExecuteInput,
  bundler: Address,
): Promise<{ transactionHashes: Hash[]; userOpHash: Hex }> {
  const { node, chainId, account, calls } = input
  const op = await buildUserOp(node, { sender: account.address, calls })
  const { signature, userOpHash } = await signUserOp(node, op, chainId)
  const hash = await submitUserOp(node, {
    op: { ...op, signature },
    bundler,
  })
  return { transactionHashes: [hash], userOpHash }
}

/**
 * Sends from the account itself: a Kernel batch to itself, one transaction per
 * call, or a plain deployment. An account the node holds no key for is
 * impersonated first.
 */
async function sendAsAccount(
  input: ExecuteInput,
  plan: SelfPaidPlan,
): Promise<ExecutionResult> {
  const { node, account, calls } = input
  const from = account.address
  if (!(await isKnownToNode(node, from))) await node.impersonate(from)
  const send = (tx: Record<string, unknown>) =>
    node.request<Hash>('eth_sendTransaction', [{ from, ...tx }])

  if (plan.path === 'sequential') {
    const transactionHashes: Hash[] = []
    for (const [index, call] of calls.entries()) {
      transactionHashes.push(
        await send({
          ...toRpcCall(call),
          ...revertingGas(plan.simulation, index),
        }),
      )
    }
    return { ...plan, transactionHashes }
  }

  const tx =
    plan.path === 'deploy'
      ? toRpcCall(calls[0] as Call)
      : { to: from, data: encodeKernelBatch(calls) }
  const hash = await send({ ...tx, ...revertingGas(plan.simulation) })
  return { ...plan, transactionHashes: [hash] }
}

/**
 * Plans, then performs, the execution of `calls`. It resolves once the
 * transactions are sent, not mined, so wait on `transactionHashes` for
 * receipts. A sponsor is funded right before a user op is sent; if that fails,
 * the calls go out as a self-call and `fallbackReason` says why.
 *
 * For `userop` the transaction is `handleOps`, whose receipt succeeds even if
 * the operation fails. Read the real outcome with `getUserOpOutcome`; if that
 * throws, the operation did not execute.
 *
 * @throws The errors of `planExecution`, or the node's own.
 */
export async function executeCalls(
  input: ExecuteInput,
): Promise<ExecutionResult> {
  const plan = await planExecution(input)
  if (plan.path !== 'userop') {
    return sendAsAccount(input, { ...plan, path: plan.path })
  }

  const sponsorPlan = await prepareSponsor(input.node, input.sponsor)
  if (!sponsorPlan.ok) {
    return sendAsAccount(
      input,
      selfPaid(
        'self-call',
        input.account.address,
        plan.simulation,
        sponsorPlan.reason,
      ),
    )
  }
  return {
    ...plan,
    payer: sponsorPlan.sender,
    ...(await sendUserOp(input, sponsorPlan.sender)),
  }
}
