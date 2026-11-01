import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import type { Address, Hash } from 'viem'

import type { ContractsScanCursor } from '~/actions/getContracts'

// The stores are built on `chrome.storage` and import each other through the
// `./index` barrel, which has to be loaded first. An empty `chrome` makes the
// storage a no-op.
let contractsStore: typeof import('./contracts').contractsStore
let getContractsKey: typeof import('./contracts').getContractsKey

beforeAll(async () => {
  const globals = globalThis as { chrome?: unknown }
  const previous = globals.chrome
  globals.chrome = {}
  try {
    await import('./index')
    ;({ contractsStore, getContractsKey } = await import('./contracts'))
  } finally {
    globals.chrome = previous
  }
})

beforeEach(() => {
  contractsStore.setState({ contracts: {}, scanCursors: {} })
})

const a = '0x00000000000000000000000000000000000000aa' as Address
const b = '0x00000000000000000000000000000000000000bb' as Address
const c = '0x00000000000000000000000000000000000000cc' as Address
const cursor = (blockNumber: bigint): ContractsScanCursor => ({
  fromBlock: 1n,
  blockNumber,
  blockHash: `0x${blockNumber.toString(16).padStart(64, '0')}` as Hash,
})

const key = { rpcUrl: 'http://127.0.0.1:8545' }
const contractsOf = (rpcUrl = key.rpcUrl) =>
  contractsStore.getState().contracts[getContractsKey({ rpcUrl })] ?? []
const addresses = (rpcUrl = key.rpcUrl) =>
  contractsOf(rpcUrl).map((contract) => contract.address)

describe('syncContracts', () => {
  test('adds what a scan found, newest first', () => {
    contractsStore.getState().syncContracts(key, {
      contracts: [{ address: a }, { address: b }],
      cursor: cursor(10n),
    })
    expect(addresses()).toEqual([b, a])
  })

  test('keeps earlier finds when a later scan only returns new ones', () => {
    const { syncContracts } = contractsStore.getState()
    syncContracts(key, { contracts: [{ address: a }], cursor: cursor(10n) })
    syncContracts(key, { contracts: [{ address: b }], cursor: cursor(20n) })
    syncContracts(key, { contracts: [], cursor: cursor(30n) })

    expect(addresses()).toEqual([b, a])
  })

  test('does not duplicate contracts a full rescan finds again', () => {
    const { syncContracts } = contractsStore.getState()
    syncContracts(key, {
      contracts: [{ address: a }, { address: b }],
      cursor: cursor(10n),
    })
    contractsStore.getState().hideContract(key, { address: a })
    syncContracts(key, {
      contracts: [{ address: a }, { address: b }, { address: c }],
      cursor: cursor(10n),
    })

    expect(addresses()).toEqual([c, b, a])
    // What the user did to a contract survives a rescan.
    expect(contractsOf().find((x) => x.address === a)?.visible).toBe(false)
  })

  test('remembers the cursor per network', () => {
    const { syncContracts } = contractsStore.getState()
    const other = { rpcUrl: 'http://127.0.0.1:8546' }
    syncContracts(key, { contracts: [], cursor: cursor(10n) })
    syncContracts(other, { contracts: [{ address: a }], cursor: cursor(5n) })
    syncContracts(key, { contracts: [], cursor: cursor(20n) })

    const { scanCursors } = contractsStore.getState()
    expect(Object.values(scanCursors).map((x) => x?.blockNumber)).toEqual([
      20n,
      5n,
    ])
    expect(addresses(other.rpcUrl)).toEqual([a])
    expect(addresses()).toEqual([])
  })

  test('keeps the cursor when a sync comes without one', () => {
    const { syncContracts } = contractsStore.getState()
    syncContracts(key, { contracts: [], cursor: cursor(10n) })
    syncContracts(key, { contracts: [{ address: a }] })
    syncContracts(key, { contracts: [{ address: b }], cursor: null })

    expect(
      Object.values(contractsStore.getState().scanCursors).map(
        (x) => x?.blockNumber,
      ),
    ).toEqual([10n])
    expect(addresses()).toEqual([b, a])
  })
})
