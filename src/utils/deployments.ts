import type { Abi, Address, Hex } from 'viem'

/**
 * A contract discovered by importing a local framework project
 * (Foundry, Hardhat, …) from disk.
 */
export type DeployedContract = {
  address: Address
  name: string
  abi?: Abi
  bytecode?: Hex
}

export type DirectoryFile = File & { webkitRelativePath?: string }

// Guardrails shared by every directory importer to avoid blowing up memory
// when a user accidentally selects a huge directory.
export const MAX_FILES = 1000
export const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB max per file

export function getRelativePath(file: DirectoryFile) {
  if (file.webkitRelativePath && file.webkitRelativePath.length > 0)
    return file.webkitRelativePath
  return file.name
}

type ArtifactBytecode = Hex | { object?: Hex } | undefined

/**
 * Normalize the bytecode field of an artifact. Foundry nests it as
 * `{ object }`, Hardhat stores it as a plain hex string — both are handled.
 * Prefers the runtime (deployed) bytecode, which is what lives on-chain.
 */
export function extractBytecode(artifact: {
  bytecode?: ArtifactBytecode
  deployedBytecode?: ArtifactBytecode
}): Hex | undefined {
  if (!artifact.bytecode && !artifact.deployedBytecode) return undefined

  const normalize = (value?: ArtifactBytecode) => {
    if (!value) return undefined
    if (typeof value === 'string') return value as Hex
    return value.object
  }

  return normalize(artifact.deployedBytecode) ?? normalize(artifact.bytecode)
}

/**
 * Merge contracts discovered from multiple sources, de-duplicating by address.
 * When the same address appears twice, the entry carrying an ABI wins.
 */
export function dedupeByAddress(
  contracts: DeployedContract[],
): DeployedContract[] {
  const byAddress = new Map<string, DeployedContract>()
  for (const contract of contracts) {
    const key = contract.address.toLowerCase()
    const existing = byAddress.get(key)
    if (!existing || (!existing.abi && contract.abi))
      byAddress.set(key, { ...existing, ...contract })
  }
  return Array.from(byAddress.values())
}
