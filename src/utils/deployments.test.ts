import { describe, expect, test } from 'bun:test'

import {
    type DeployedContract,
    dedupeByAddress,
    extractBytecode,
    getRelativePath,
} from './deployments'

describe('getRelativePath', () => {
    test('prefers webkitRelativePath when present', () => {
        const file = {
            name: 'Token.json',
            webkitRelativePath: 'proj/out/Token.sol/Token.json',
        } as unknown as File
        expect(getRelativePath(file)).toBe('proj/out/Token.sol/Token.json')
    })

    test('falls back to name when webkitRelativePath is empty', () => {
        const file = { name: 'Token.json', webkitRelativePath: '' } as unknown as File
        expect(getRelativePath(file)).toBe('Token.json')
    })
})

describe('extractBytecode', () => {
    test('prefers runtime (deployed) bytecode over creation bytecode', () => {
        expect(
            extractBytecode({ bytecode: '0xcreation', deployedBytecode: '0xruntime' }),
        ).toBe('0xruntime')
    })

    test('unwraps the Foundry { object } shape', () => {
        expect(
            extractBytecode({ deployedBytecode: { object: '0xabc' } }),
        ).toBe('0xabc')
    })

    test('handles a plain hex string (Hardhat shape)', () => {
        expect(extractBytecode({ bytecode: '0xdef' })).toBe('0xdef')
    })

    test('returns undefined when no bytecode is present', () => {
        expect(extractBytecode({})).toBeUndefined()
    })
})

describe('dedupeByAddress', () => {
    const make = (
        address: string,
        extra: Partial<DeployedContract> = {},
    ): DeployedContract => ({ address: address as `0x${string}`, name: 'C', ...extra })

    test('de-duplicates case-insensitively by address', () => {
        const result = dedupeByAddress([
            make('0xAbC0000000000000000000000000000000000000'),
            make('0xabc0000000000000000000000000000000000000'),
        ])
        expect(result).toHaveLength(1)
    })

    test('the entry carrying an ABI wins, and fields merge', () => {
        const addr = '0x1111111111111111111111111111111111111111'
        const result = dedupeByAddress([
            make(addr, { name: 'NoAbi', bytecode: '0xaa' }),
            make(addr, {
                name: 'WithAbi',
                abi: [
                    {
                        type: 'function',
                        name: 'f',
                        inputs: [],
                        outputs: [],
                        stateMutability: 'nonpayable',
                    },
                ],
            }),
        ])
        expect(result).toHaveLength(1)
        expect(result[0].abi).toBeDefined()
        expect(result[0].name).toBe('WithAbi')
        // field from the first (no-abi) entry is preserved through the merge
        expect(result[0].bytecode).toBe('0xaa')
    })
})
