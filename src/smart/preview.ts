// Chrome-free: the background builds previews and the approval UI reads them,
// so they cross the messenger and hold no bigints.
import { type Address, type Hex, isHex } from 'viem'

import { serializeError } from './errors'
import {
  type ExecutionPath,
  type ExecutionPlan,
  planExecution,
} from './execute'
import { atomicStatus } from './modes'
import type { BalanceChange, SimulationResult } from './simulate'
import {
  type AccountMode,
  type AtomicStatus,
  type OnchainKind,
  type RpcCall,
  toCall,
} from './types'
import { getFees } from './userop'
import type { WalletAccount, WalletCoreDeps } from './wallet-core'

/** `SimulationResult`, with every bigint as a decimal string. */
export type SerializedSimulation =
  | {
      ok: true
      gasUsed: string | null
      balanceChanges:
        | { token: BalanceChange['token']; delta: string }[]
        | null
    }
  | {
      ok: false
      failedIndex: number | null
      revertData: Hex | null
      message: string
    }

/** What sending the calls would do, for the approval screens. */
export type SendPreview = {
  mode: AccountMode
  onchain: OnchainKind
  atomicStatus: AtomicStatus
  /** `null` when the calls can't be sent (see `error`). */
  path: ExecutionPath | null
  payer: Address | null
  sponsored: boolean
  fallbackReason?: string
  /** `gasUsed × maxFeePerGas`, or `null` when the gas isn't known. */
  estimatedCostWei: string | null
  simulation: SerializedSimulation
  /** Why the calls can't be sent at all, as the dApp would receive it. */
  error?: { code: number; message: string; data?: unknown }
}

function serializeSimulation(s: SimulationResult): SerializedSimulation {
  if (!s.ok) {
    return {
      ok: false,
      failedIndex: s.failedIndex,
      revertData: s.revertData,
      message: s.message,
    }
  }
  return {
    ok: true,
    gasUsed: s.gasUsed === null ? null : s.gasUsed.toString(),
    balanceChanges:
      s.balanceChanges === null
        ? null
        : s.balanceChanges.map(({ token, delta }) => ({
            token,
            delta: delta.toString(),
          })),
  }
}

/**
 * The preview of a plan, or of the error that stopped one. An error has no
 * path or payer; its simulation is a failure carrying the error's message and
 * any revert data.
 */
export function toSendPreview(args: {
  mode: AccountMode
  onchain: OnchainKind
  plan?: ExecutionPlan
  error?: unknown
  maxFeePerGas: bigint
}): SendPreview {
  const { mode, onchain, plan, maxFeePerGas } = args
  const account = { mode, onchain, atomicStatus: atomicStatus(mode, onchain) }

  if (!plan) {
    const error = serializeError(args.error)
    return {
      ...account,
      path: null,
      payer: null,
      sponsored: false,
      estimatedCostWei: null,
      simulation: {
        ok: false,
        failedIndex: null,
        revertData: isHex(error.data) ? error.data : null,
        message: error.message,
      },
      error,
    }
  }

  const { simulation } = plan
  return {
    ...account,
    path: plan.path,
    payer: plan.payer,
    sponsored: plan.sponsored,
    ...(plan.fallbackReason !== undefined && {
      fallbackReason: plan.fallbackReason,
    }),
    estimatedCostWei:
      simulation.ok && simulation.gasUsed !== null
        ? (simulation.gasUsed * maxFeePerGas).toString()
        : null,
    simulation: serializeSimulation(simulation),
  }
}

/**
 * Plans the calls without sending anything. It plans with `force`, so a
 * predicted revert comes back as a failed `simulation` (with the failing call)
 * and the path "Sign anyway" would take; `error` is left for requests that
 * can't be sent at all (`5760`, `-32602`, node errors).
 *
 * `asSmart` plans a plain-upgradable account as the Kernel account it is about
 * to become; the preview still reports its current mode and code.
 */
export async function previewCalls(
  deps: Pick<WalletCoreDeps, 'node' | 'chainId' | 'sponsor'>,
  args: {
    account: WalletAccount
    calls: readonly RpcCall[]
    atomicRequired: boolean
    asSmart: boolean
  },
): Promise<SendPreview> {
  const { account } = args
  let plan: ExecutionPlan | undefined
  let error: unknown
  try {
    plan = await planExecution({
      node: deps.node,
      chainId: deps.chainId,
      account: args.asSmart
        ? { ...account, mode: 'smart', onchain: { kind: 'kernel' } }
        : account,
      calls: args.calls.map(toCall),
      atomicRequired: args.atomicRequired,
      sponsor: deps.sponsor,
      force: true,
    })
  } catch (e) {
    error = e
  }
  const { maxFeePerGas } = await getFees(deps.node)
  return toSendPreview({
    mode: account.mode,
    onchain: account.onchain,
    plan,
    error,
    maxFeePerGas,
  })
}
