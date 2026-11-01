import { type EIP1193Provider, numberToHex } from 'viem'

import type { BatchRecord, BatchRecords } from '../batch-records'
import { type WalletCoreDeps, handleWalletRequest } from '../wallet-core'

/** Batch records that live and die with the object. */
export function memoryRecords(): BatchRecords {
  const records = new Map<string, BatchRecord>()
  return {
    get: (id) => records.get(id),
    put: (record) => void records.set(record.id, record),
  }
}

/**
 * An EIP-1193 provider for tests: the `wallet_*` methods go to
 * `handleWalletRequest`, the account and chain are answered from `deps`, and
 * everything else goes to the node. Errors keep their numeric `code`.
 */
export function createTestWallet(
  deps: Omit<WalletCoreDeps, 'records'>,
): EIP1193Provider {
  const walletDeps = { ...deps, records: memoryRecords() }

  async function request({
    method,
    params,
  }: { method: string; params?: unknown }): Promise<unknown> {
    const args = params as unknown[] | undefined
    if (method.startsWith('wallet_')) {
      return handleWalletRequest(walletDeps, { method, params: args })
    }
    if (method === 'eth_accounts') return deps.accounts.map((a) => a.address)
    if (method === 'eth_chainId') return numberToHex(deps.chainId)
    return deps.node.request(method, args)
  }

  return { request } as unknown as EIP1193Provider
}
