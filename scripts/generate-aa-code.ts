/**
 * Generates the bundled account-abstraction bytecode.
 *
 * Fetches the runtime code of EntryPoint v0.7, SenderCreator and Kernel v3.3
 * from Ethereum mainnet and of Kernel v3.3 from Arbitrum Sepolia, reads the
 * compiled DevWalletPaymaster from `contracts/out`, and writes:
 *   - src/smart/aa-code.generated.ts
 *   - src/smart/testing/kernel-arbitrum-sepolia.generated.ts
 *
 * Run with `bun run aa:generate` (it builds the contracts first). The output is
 * committed, so nothing needs the network at runtime.
 */
import { join } from 'node:path'

import type { Address, Hex } from 'viem'

import {
  ENTRY_POINT_07,
  KERNEL_V3_3,
  SENDER_CREATOR_07,
} from '../src/smart/constants'

const MAINNET_RPC_URL =
  process.env.MAINNET_RPC_URL ?? 'https://ethereum-rpc.publicnode.com'
const ARBITRUM_SEPOLIA_RPC_URL =
  process.env.ARBITRUM_SEPOLIA_RPC_URL ??
  'https://arbitrum-sepolia-rpc.publicnode.com'

const root = join(import.meta.dir, '..')
const paymasterArtifact = join(
  root,
  'contracts/out/DevWalletPaymaster.sol/DevWalletPaymaster.json',
)
const aaCodePath = join(root, 'src/smart/aa-code.generated.ts')
const kernelFixturePath = join(
  root,
  'src/smart/testing/kernel-arbitrum-sepolia.generated.ts',
)

type Source = { chain: string; blockNumber: string; address: Address }
type Fetched = { code: Hex; source: Source }

async function rpc<T>(url: string, method: string, params: unknown[]) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!res.ok) throw new Error(`${method} on ${url}: HTTP ${res.status}`)
  const { result, error } = (await res.json()) as {
    result?: T
    error?: { message: string }
  }
  if (error) throw new Error(`${method} on ${url}: ${error.message}`)
  return result as T
}

/**
 * The block number is read just before the code. These contracts are
 * immutable, so the recorded number is only provenance, not a pin.
 */
async function fetchCode(
  chain: string,
  url: string,
  address: Address,
): Promise<Fetched> {
  const blockNumber = BigInt(await rpc<Hex>(url, 'eth_blockNumber', []))
  const fetched = await rpc<Hex>(url, 'eth_getCode', [address, 'latest'])
  const code = fetched.toLowerCase() as Hex
  if (code === '0x') throw new Error(`no code at ${address} on ${chain}`)
  return {
    code,
    source: { chain, blockNumber: blockNumber.toString(), address },
  }
}

function toBytes(code: Hex): Uint8Array {
  return Uint8Array.from(Buffer.from(code.slice(2), 'hex'))
}

/** `[start, end)` ranges of PUSH operands, walking opcode by opcode. */
function pushOperandRanges(code: Uint8Array): [number, number][] {
  const ranges: [number, number][] = []
  let i = 0
  while (i < code.length) {
    const op = code[i]
    if (op >= 0x60 && op <= 0x7f) {
      const operandSize = op - 0x5f
      ranges.push([i + 1, Math.min(i + 1 + operandSize, code.length)])
      i += 1 + operandSize
    } else {
      i += 1
    }
  }
  return ranges
}

/**
 * Kernel's runtime code differs between source chains only in deploy-time
 * immutables, which Solidity inlines as PUSH operands. Returns every PUSH
 * operand that contains a differing byte; throws if any differing byte lies
 * outside a PUSH operand, since that is not an immutable.
 */
function immutableRanges(a: Hex, b: Hex): [number, number][] {
  const x = toBytes(a)
  const y = toBytes(b)
  if (x.length !== y.length) {
    throw new Error(
      `Kernel builds differ in length (${x.length} vs ${y.length})`,
    )
  }

  const operands = pushOperandRanges(x)
  const operandAt = new Int32Array(x.length).fill(-1)
  operands.forEach(([start, end], index) => operandAt.fill(index, start, end))

  const hit = new Set<number>()
  for (let offset = 0; offset < x.length; offset++) {
    if (x[offset] === y[offset]) continue
    const index = operandAt[offset]
    if (index === -1) {
      throw new Error(
        `Kernel builds differ at byte ${offset}, outside any PUSH operand`,
      )
    }
    hit.add(index)
  }
  return [...hit].sort((p, q) => p - q).map((index) => operands[index])
}

async function paymasterCode(): Promise<Hex> {
  const file = Bun.file(paymasterArtifact)
  if (!(await file.exists())) {
    throw new Error(
      `${paymasterArtifact} not found; run \`forge build --root contracts\``,
    )
  }
  const artifact = (await file.json()) as {
    deployedBytecode: { object: Hex }
  }
  return artifact.deployedBytecode.object.toLowerCase() as Hex
}

const [entryPoint, senderCreator, kernel, kernelArbitrumSepolia, paymaster] =
  await Promise.all([
    fetchCode('ethereum-mainnet', MAINNET_RPC_URL, ENTRY_POINT_07),
    fetchCode('ethereum-mainnet', MAINNET_RPC_URL, SENDER_CREATOR_07),
    fetchCode('ethereum-mainnet', MAINNET_RPC_URL, KERNEL_V3_3),
    fetchCode('arbitrum-sepolia', ARBITRUM_SEPOLIA_RPC_URL, KERNEL_V3_3),
    paymasterCode(),
  ])

const ranges = immutableRanges(kernel.code, kernelArbitrumSepolia.code)
if (ranges.length === 0) {
  throw new Error('mainnet and Arbitrum Sepolia Kernel are identical')
}

const sources = {
  ENTRY_POINT_07: entryPoint.source,
  SENDER_CREATOR_07: senderCreator.source,
  KERNEL_V3_3: kernel.source,
  KERNEL_V3_3_ARBITRUM_SEPOLIA: kernelArbitrumSepolia.source,
}

const rangesSource = `[${ranges.map(([s, e]) => `[${s}, ${e}]`).join(', ')}]`
const sourcesSource = Object.entries(sources)
  .map(
    ([name, { chain, blockNumber, address }]) => `  ${name}: {
    chain: '${chain}',
    blockNumber: '${blockNumber}',
    address: '${address}',
  },`,
  )
  .join('\n')

const header = '// Generated by scripts/generate-aa-code.ts. Do not edit.\n'

await Bun.write(
  aaCodePath,
  `${header}// Run \`bun run aa:generate\` to regenerate.
import type { Address, Hex } from 'viem'

export const ENTRY_POINT_07_CODE: Hex = '${entryPoint.code}'

export const SENDER_CREATOR_07_CODE: Hex = '${senderCreator.code}'

/** Kernel v3.3 as deployed on Ethereum mainnet. */
export const KERNEL_V3_3_CODE: Hex = '${kernel.code}'

/** Compiled from contracts/src/DevWalletPaymaster.sol (solc 0.8.24, cancun). */
export const DEVWALLET_PAYMASTER_CODE: Hex = '${paymaster}'

/**
 * Byte offsets \`[start, end)\` of the Kernel build's deploy-time immutables
 * (inlined PUSH operands), i.e. where mainnet and Arbitrum Sepolia differ.
 */
export const KERNEL_IMMUTABLE_RANGES: readonly (readonly [
  start: number,
  end: number,
])[] = ${rangesSource}

export const AA_CODE_SOURCES: Record<
  string,
  { chain: string; blockNumber: string; address: Address }
> = {
${sourcesSource}
}
`,
)

await Bun.write(
  kernelFixturePath,
  `${header}// Test fixture: Kernel v3.3 as deployed on Arbitrum Sepolia (block ${kernelArbitrumSepolia.source.blockNumber}).
import type { Hex } from 'viem'

export const KERNEL_V3_3_ARBITRUM_SEPOLIA_CODE: Hex = '${kernelArbitrumSepolia.code}'
`,
)

console.log('Wrote', aaCodePath)
console.log('Wrote', kernelFixturePath)
console.log('Kernel immutable ranges:', JSON.stringify(ranges))
console.log('Sources:', JSON.stringify(sources, null, 2))
