import { type Address, type Hex, isAddress } from 'viem'

import type { BatchRecord, BatchRecords } from './batch-records'
import {
  getCallsStatus,
  getCapabilities,
  isQuantity,
  parseSendCalls,
} from './eip5792'
import { WalletRpcError } from './errors'
import { executeCalls } from './execute'
import { atomicStatus } from './modes'
import type { Node } from './node'
import {
  type AccountMode,
  type OnchainKind,
  type SponsorSetting,
  toRpcCall,
} from './types'

const INVALID_PARAMS = -32602
const UNAUTHORIZED = 4100
const UNSUPPORTED_METHOD = 4200
const UNKNOWN_BUNDLE_ID = 5730

type WalletAccount = {
  address: Address
  mode: AccountMode
  onchain: OnchainKind
  /** Whether the node holds the account's key, so it can sign a user op. */
  canSign: boolean
}

export type WalletCoreDeps = {
  node: Node
  rpcUrl: string
  chainId: number
  activeAccount: Address
  accounts: readonly WalletAccount[]
  sponsor: SponsorSetting
  /** The batch records of this network. */
  records: BatchRecords
  /** Send calls even though the simulation failed. */
  force?: boolean
}

function findAccount(
  accounts: readonly WalletAccount[],
  address: string,
): WalletAccount | undefined {
  return accounts.find((a) => a.address.toLowerCase() === address.toLowerCase())
}

function capabilitiesFor(
  deps: WalletCoreDeps,
  params: unknown[] = [],
): ReturnType<typeof getCapabilities> {
  const [address, chainIds] = params
  if (typeof address !== 'string' || !isAddress(address, { strict: false })) {
    throw new WalletRpcError(INVALID_PARAMS, 'Expected an account address')
  }
  if (
    chainIds !== undefined &&
    !(Array.isArray(chainIds) && chainIds.every(isQuantity))
  ) {
    throw new WalletRpcError(INVALID_PARAMS, 'Expected hex chain ids')
  }
  const account = findAccount(deps.accounts, address)
  if (!account) {
    throw new WalletRpcError(
      UNAUTHORIZED,
      `The account ${address} is not one of the wallet's accounts`,
    )
  }
  return getCapabilities({
    chainId: deps.chainId,
    status: atomicStatus(account.mode, account.onchain),
    requestedChainIds: chainIds as Hex[] | undefined,
  })
}

/**
 * Executes the batch, then records it. If execution throws nothing is
 * recorded and no id is issued.
 */
async function sendCalls(
  deps: WalletCoreDeps,
  params: unknown[] | undefined,
): Promise<{ id: string }> {
  const { id, from, calls, atomicRequired } = parseSendCalls(params, {
    chainId: deps.chainId,
    activeAccount: deps.activeAccount,
    knownAccounts: deps.accounts.map((a) => a.address),
    records: deps.records,
  })
  const account = findAccount(deps.accounts, from)
  if (!account) {
    throw new WalletRpcError(
      UNAUTHORIZED,
      `The account ${from} is not one of the wallet's accounts`,
    )
  }

  const result = await executeCalls({
    node: deps.node,
    chainId: deps.chainId,
    account,
    calls,
    atomicRequired,
    sponsor: deps.sponsor,
    force: deps.force,
  })

  const record: BatchRecord = {
    id,
    rpcUrl: deps.rpcUrl,
    chainId: deps.chainId,
    from,
    calls: calls.map(toRpcCall),
    path: result.path,
    transactionHashes: result.transactionHashes,
    ...(result.userOpHash && { userOpHash: result.userOpHash }),
    createdAt: Date.now(),
  }
  deps.records.put(record)
  return { id }
}

async function callsStatus(
  deps: WalletCoreDeps,
  params: unknown[] = [],
): ReturnType<typeof getCallsStatus> {
  const [id] = params
  if (typeof id !== 'string') {
    throw new WalletRpcError(INVALID_PARAMS, 'Expected a batch id')
  }
  const record = deps.records.get(id)
  if (!record) {
    throw new WalletRpcError(UNKNOWN_BUNDLE_ID, `Unknown batch id ${id}`)
  }
  return getCallsStatus(deps.node, record)
}

/**
 * The EIP-5792 methods: `wallet_getCapabilities`, `wallet_sendCalls` and
 * `wallet_getCallsStatus`. Chrome-free: the caller supplies the node, the
 * accounts and the records. Errors are `WalletRpcError`s with their EIP code;
 * any other method is `4200`.
 */
export async function handleWalletRequest(
  deps: WalletCoreDeps,
  request: { method: string; params?: unknown[] },
): Promise<unknown> {
  switch (request.method) {
    case 'wallet_getCapabilities':
      return capabilitiesFor(deps, request.params)
    case 'wallet_sendCalls':
      return sendCalls(deps, request.params)
    case 'wallet_getCallsStatus':
      return callsStatus(deps, request.params)
    default:
      throw new WalletRpcError(
        UNSUPPORTED_METHOD,
        `The method ${request.method} is not supported`,
      )
  }
}
