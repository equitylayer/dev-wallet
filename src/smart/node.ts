import {
  type Address,
  type Hex,
  hexToBigInt,
  hexToNumber,
  numberToHex,
} from 'viem'
import { getHttpRpcClient } from 'viem/utils'

import { WalletRpcError } from './errors'

export type NodeKind = 'anvil' | 'hardhat'

export type Node = {
  rpcUrl: string
  kind: NodeKind
  /** JSON-RPC request. `anvil_*` cheat methods are translated for the node. */
  request<T = unknown>(method: string, params?: unknown[]): Promise<T>
  chainId(): Promise<number>
  blockNumber(): Promise<bigint>
  getCode(a: Address): Promise<Hex>
  setCode(a: Address, code: Hex): Promise<void>
  getBalance(a: Address): Promise<bigint>
  setBalance(a: Address, wei: bigint): Promise<void>
  impersonate(a: Address): Promise<void>
}

// Cheat methods that Hardhat exposes under a `hardhat_` prefix.
const HARDHAT_CHEATS = new Set([
  'setCode',
  'setBalance',
  'setNonce',
  'setStorageAt',
  'impersonateAccount',
  'stopImpersonatingAccount',
  'mine',
  'getAutomine',
  'reset',
  'dropTransaction',
  'setCoinbase',
  'setMinGasPrice',
  'setNextBlockBaseFeePerGas',
  'setLoggingEnabled',
])

/** Translates an `anvil_*` cheat method to the node's own name for it. */
export function nodeMethod(kind: NodeKind, method: string): string {
  if (kind !== 'hardhat' || !method.startsWith('anvil_')) return method
  const suffix = method.slice('anvil_'.length)
  return HARDHAT_CHEATS.has(suffix) ? `hardhat_${suffix}` : method
}

function detectKind(clientVersion: unknown): NodeKind {
  if (typeof clientVersion !== 'string') return 'anvil'
  const version = clientVersion.toLowerCase()
  if (version.startsWith('anvil')) return 'anvil'
  if (version.includes('hardhat') || version.includes('edr')) return 'hardhat'
  return 'anvil'
}

const nodeCache = new Map<string, Promise<Node>>()

export function connectNode({ rpcUrl }: { rpcUrl: string }): Promise<Node> {
  const cached = nodeCache.get(rpcUrl)
  if (cached) return cached

  const connecting = createNode(rpcUrl)
  nodeCache.set(rpcUrl, connecting)
  // Don't cache a failed connection (e.g. node not up yet).
  connecting.catch(() => {
    if (nodeCache.get(rpcUrl) === connecting) nodeCache.delete(rpcUrl)
  })
  return connecting
}

async function createNode(rpcUrl: string): Promise<Node> {
  const rpcClient = getHttpRpcClient(rpcUrl)

  async function send<T>(method: string, params: unknown[] = []): Promise<T> {
    const { result, error } = (await rpcClient.request({
      body: { method, params },
    })) as {
      result?: T
      error?: { code: number; message: string; data?: unknown }
    }
    if (error) throw new WalletRpcError(error.code, error.message, error.data)
    return result as T
  }

  // A node that rejects `web3_clientVersion` is treated as Anvil; a transport
  // failure propagates so an unreachable node isn't cached with a guessed kind.
  const { result: clientVersion } = await rpcClient.request({
    body: { method: 'web3_clientVersion' },
  })
  const kind = detectKind(clientVersion)

  const request: Node['request'] = (method, params) =>
    send(nodeMethod(kind, method), params)

  return {
    rpcUrl,
    kind,
    request,
    async chainId() {
      return hexToNumber(await request<Hex>('eth_chainId'))
    },
    async blockNumber() {
      return hexToBigInt(await request<Hex>('eth_blockNumber'))
    },
    getCode(a) {
      return request<Hex>('eth_getCode', [a, 'latest'])
    },
    async setCode(a, code) {
      await request('anvil_setCode', [a, code])
    },
    async getBalance(a) {
      return hexToBigInt(await request<Hex>('eth_getBalance', [a, 'latest']))
    },
    async setBalance(a, wei) {
      await request('anvil_setBalance', [a, numberToHex(wei)])
    },
    async impersonate(a) {
      await request('anvil_impersonateAccount', [a])
    },
  }
}
