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

/** A JSON-RPC request as a page or the wallet's UI sent it. */
export type ForwardedRequest = {
  method: string
  params?: unknown
  id?: number
  jsonrpc?: '2.0'
}

/** The node's own answer to a request, error included. */
export type ForwardedResponse = {
  jsonrpc: '2.0'
  id?: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export type Node = {
  rpcUrl: string
  /**
   * What the node is, as last read. A different node on the same url is
   * noticed when it refuses a translated cheat (`request`, `forward`).
   */
  readonly kind: NodeKind
  /**
   * JSON-RPC request. `anvil_*` cheat methods are translated for the node.
   * One the node refuses as unknown has the node's kind read again, and is
   * sent once more if it changed.
   */
  request<T = unknown>(method: string, params?: unknown[]): Promise<T>
  /**
   * A request passed through for a page or the wallet's UI, translated and
   * retried like `request`, that answers the node's raw response.
   */
  forward(body: ForwardedRequest): Promise<ForwardedResponse>
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

/** JSON-RPC "method not found", as Anvil answers an unknown method. */
const METHOD_NOT_FOUND = -32601
/** Hardhat 3's (EDR) answer to a method it lacks: "Method … is not supported". */
const METHOD_NOT_SUPPORTED = -32004

/**
 * Whether the node's refusal of `method` may mean it is another kind of node
 * than the one detected: a cheat whose name depends on the kind, refused as
 * unknown. Anvil then Hardhat on the same url is the case: Hardhat refuses
 * `anvil_setCode`.
 */
export function mayBeAnotherNode(method: string, code: number): boolean {
  const unknown = code === METHOD_NOT_FOUND || code === METHOD_NOT_SUPPORTED
  return (
    unknown &&
    method.startsWith('anvil_') &&
    HARDHAT_CHEATS.has(method.slice('anvil_'.length))
  )
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

  // A node that rejects `web3_clientVersion` is treated as Anvil; a transport
  // failure propagates so an unreachable node isn't cached with a guessed kind.
  async function readKind(): Promise<NodeKind> {
    const { result: clientVersion } = await rpcClient.request({
      body: { method: 'web3_clientVersion' },
    })
    return detectKind(clientVersion)
  }

  // Kept for the worker's life, and read again only when the node refuses a
  // cheat as unknown: cheaper than asking before each request, and the one
  // place a stale kind shows. The cached node changes in place, so its
  // holders see the new kind too.
  let kind = await readKind()

  async function forward(body: ForwardedRequest): Promise<ForwardedResponse> {
    const sendAs = async (as: NodeKind) =>
      (await rpcClient.request({
        body: { ...body, method: nodeMethod(as, body.method) },
      })) as ForwardedResponse
    // Compared with the kind this request went as, not the latest: a
    // concurrent request may have read the new kind already.
    const tried = kind
    const response = await sendAs(tried)
    const { error } = response
    if (!error || !mayBeAnotherNode(body.method, error.code)) return response
    try {
      kind = await readKind()
    } catch {
      return response
    }
    return kind === tried ? response : sendAs(kind)
  }

  const request: Node['request'] = async <T>(
    method: string,
    params: unknown[] = [],
  ) => {
    const { result, error } = await forward({ method, params })
    if (error) throw new WalletRpcError(error.code, error.message, error.data)
    return result as T
  }

  return {
    rpcUrl,
    get kind() {
      return kind
    },
    request,
    forward,
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
