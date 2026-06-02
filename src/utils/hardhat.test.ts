import { describe, expect, test } from 'bun:test'

import { loadHardhatContractsFromDirectory } from './hardhat'

// Build a minimal File-like object mimicking a directory-picked file.
function file(path: string, body: unknown): File {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return {
    name: path.split('/').pop() ?? path,
    webkitRelativePath: path,
    size: text.length,
    text: async () => text,
  } as unknown as File
}

const abi = (name: string) => [{ type: 'function', name }]

describe('loadHardhatContractsFromDirectory — Ignition (Hardhat 3)', () => {
  test('imports contracts with abi + runtime bytecode, resolving aliased ids', async () => {
    const contracts = await loadHardhatContractsFromDirectory([
      // root-folder prefix as produced by a directory picker
      file('proj/ignition/deployments/chain-31337/deployed_addresses.json', {
        'TokenModule#MyToken': '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'TokenModule#aliased': '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }),
      file(
        'proj/ignition/deployments/chain-31337/artifacts/TokenModule#MyToken.json',
        {
          contractName: 'MyToken',
          abi: abi('foo'),
          bytecode: '0xcreation',
          deployedBytecode: '0xruntime',
        },
      ),
      // aliased future id -> the real contract name from the artifact wins
      file(
        'proj/ignition/deployments/chain-31337/artifacts/TokenModule#aliased.json',
        { contractName: 'Counter', abi: abi('inc'), deployedBytecode: '0xcounter' },
      ),
    ])

    expect(contracts).toHaveLength(2)

    const myToken = contracts.find((c) => c.name === 'MyToken')
    expect(myToken?.abi).toBeDefined()
    expect(myToken?.bytecode).toBe('0xruntime') // prefers deployed bytecode

    const counter = contracts.find((c) => c.name === 'Counter')
    expect(counter?.address).toBe('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
  })

  test('ignores deployments on non-local chains', async () => {
    const contracts = await loadHardhatContractsFromDirectory([
      file('ignition/deployments/chain-31337/deployed_addresses.json', {
        'M#Local': '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
      file('ignition/deployments/chain-11155111/deployed_addresses.json', {
        'M#Remote': '0x9999999999999999999999999999999999999999',
      }),
    ])
    expect(contracts.map((c) => c.name)).toEqual(['Local'])
  })

  test('imports a contract even when its artifact is missing (name from future id)', async () => {
    const contracts = await loadHardhatContractsFromDirectory([
      file('ignition/deployments/chain-31337/deployed_addresses.json', {
        'M#Orphan': '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    ])
    expect(contracts).toHaveLength(1)
    expect(contracts[0].name).toBe('Orphan')
    expect(contracts[0].abi).toBeUndefined()
  })
})

describe('loadHardhatContractsFromDirectory — hardhat-deploy', () => {
  test('imports from a local network resolved via .chainId', async () => {
    const contracts = await loadHardhatContractsFromDirectory([
      file('deployments/localhost/.chainId', '31337'),
      file('deployments/localhost/Greeter.json', {
        address: '0xcccccccccccccccccccccccccccccccccccccccc',
        abi: abi('greet'),
        bytecode: '0xcreation',
        deployedBytecode: '0xruntime',
      }),
    ])
    expect(contracts).toHaveLength(1)
    expect(contracts[0].name).toBe('Greeter')
    expect(contracts[0].bytecode).toBe('0xruntime')
  })

  test('excludes networks whose .chainId is not local', async () => {
    // A sepolia-only selection has nothing on chain 31337, so the import finds
    // no local contracts and rejects.
    await expect(
      loadHardhatContractsFromDirectory([
        file('deployments/sepolia/.chainId', '11155111'),
        file('deployments/sepolia/Remote.json', {
          address: '0x8888888888888888888888888888888888888888',
          abi: abi('x'),
        }),
      ]),
    ).rejects.toThrow(/No deployed contracts found/)
  })

  test('falls back to conventional network names when no .chainId is present', async () => {
    const contracts = await loadHardhatContractsFromDirectory([
      file('deployments/hardhat/Foo.json', {
        address: '0xdddddddddddddddddddddddddddddddddddddddd',
        abi: abi('foo'),
      }),
    ])
    expect(contracts.map((c) => c.name)).toEqual(['Foo'])
  })

  test('skips files without an address (e.g. .migrations.json)', async () => {
    const contracts = await loadHardhatContractsFromDirectory([
      file('deployments/localhost/.chainId', '31337'),
      file('deployments/localhost/Real.json', {
        address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        abi: abi('r'),
      }),
      file('deployments/localhost/.migrations.json', { someMigration: 1 }),
    ])
    expect(contracts.map((c) => c.name)).toEqual(['Real'])
  })
})

describe('loadHardhatContractsFromDirectory — merging & errors', () => {
  test('de-duplicates across formats, abi-carrying entry wins', async () => {
    const shared = '0x1111111111111111111111111111111111111111'
    const contracts = await loadHardhatContractsFromDirectory([
      // Ignition entry for the shared address has no artifact -> no abi
      file('ignition/deployments/chain-31337/deployed_addresses.json', {
        'M#Shared': shared,
      }),
      // hardhat-deploy entry for the same address carries an abi
      file('deployments/localhost/.chainId', '31337'),
      file('deployments/localhost/Shared.json', {
        address: shared,
        abi: abi('shared'),
        deployedBytecode: '0xshared',
      }),
    ])
    expect(contracts).toHaveLength(1)
    expect(contracts[0].abi).toBeDefined()
    expect(contracts[0].bytecode).toBe('0xshared')
  })

  test('throws when no files are selected', async () => {
    await expect(loadHardhatContractsFromDirectory([])).rejects.toThrow(
      'No files selected',
    )
  })

  test('throws when too many files are selected', async () => {
    const many = Array.from({ length: 1001 }, (_, i) =>
      file(`deployments/localhost/C${i}.json`, { address: '0x00' }),
    )
    await expect(loadHardhatContractsFromDirectory(many)).rejects.toThrow(
      /Too many files/,
    )
  })

  test('throws a helpful error when nothing matches the local chain', async () => {
    await expect(
      loadHardhatContractsFromDirectory([
        file('src/Token.sol', '// not a deployment'),
      ]),
    ).rejects.toThrow(/No deployed contracts found/)
  })
})
