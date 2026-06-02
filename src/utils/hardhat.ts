import type { Abi, Address, Hex } from 'viem'

import {
  dedupeByAddress,
  type DeployedContract,
  type DirectoryFile,
  extractBytecode,
  getRelativePath,
  MAX_FILE_SIZE,
  MAX_FILES,
} from './deployments'

// The local dev chain. Hardhat's built-in node and Anvil both default to 31337.
const LOCAL_CHAIN_ID = '31337'
const LOCAL_NETWORK_NAMES = new Set(['localhost', 'hardhat', 'anvil'])

// Hardhat 3 / Ignition: ignition/deployments/chain-<id>/deployed_addresses.json
const IGNITION_ADDRESSES_PATTERN =
  /ignition\/deployments\/chain-(\d+)\/deployed_addresses\.json$/
// hardhat-deploy plugin: deployments/<network>/<Name>.json (+ a .chainId file)
const HH_DEPLOY_FILE_PATTERN = /(?:^|\/)deployments\/([^/]+)\/([^/]+)\.json$/
const HH_DEPLOY_CHAINID_PATTERN = /(?:^|\/)deployments\/([^/]+)\/\.chainId$/

type HardhatArtifact = {
  contractName?: string
  abi?: Abi
  bytecode?: Hex | { object?: Hex }
  deployedBytecode?: Hex | { object?: Hex }
}

type HardhatDeployFile = {
  address?: string
  abi?: Abi
  bytecode?: Hex
  deployedBytecode?: Hex
}

async function readJson<T>(file: DirectoryFile): Promise<T | undefined> {
  if (file.size > MAX_FILE_SIZE) {
    console.warn(
      '[Hardhat] Skipping large file:',
      getRelativePath(file),
      `(${Math.round(file.size / 1024 / 1024)}MB)`,
    )
    return undefined
  }
  try {
    return JSON.parse(await file.text()) as T
  } catch (error) {
    console.error('[Hardhat] JSON parse error:', getRelativePath(file), error)
    return undefined
  }
}

/**
 * Parse a Hardhat 3 (Ignition) deployment. Addresses live in
 * `deployed_addresses.json` keyed by future id ("Module#Contract"), and the
 * matching ABI/bytecode lives in `artifacts/<future-id>.json` alongside it.
 */
async function parseIgnition(
  files: DirectoryFile[],
): Promise<DeployedContract[]> {
  const addressFiles = files.filter((file) => {
    const match = getRelativePath(file).match(IGNITION_ADDRESSES_PATTERN)
    return match?.[1] === LOCAL_CHAIN_ID
  })

  if (addressFiles.length === 0) return []
  console.log('[Hardhat] Found Ignition deployments:', addressFiles.length)

  const contracts: DeployedContract[] = []

  for (const addressFile of addressFiles) {
    const addresses = await readJson<Record<string, string>>(addressFile)
    if (!addresses) continue

    // Artifacts sit in an `artifacts/` dir next to deployed_addresses.json.
    const baseDir = getRelativePath(addressFile).replace(
      /deployed_addresses\.json$/,
      '',
    )

    for (const [futureId, address] of Object.entries(addresses)) {
      const artifactPath = `${baseDir}artifacts/${futureId}.json`
      const artifactFile = files.find(
        (file) => getRelativePath(file) === artifactPath,
      )
      const artifact = artifactFile
        ? await readJson<HardhatArtifact>(artifactFile)
        : undefined

      contracts.push({
        address: address as Address,
        // Prefer the real contract name; future ids can be aliased ("Module#alias").
        name: artifact?.contractName ?? futureId.split('#').pop() ?? futureId,
        abi: artifact?.abi,
        bytecode: artifact ? extractBytecode(artifact) : undefined,
      })
    }
  }

  return contracts
}

/**
 * Parse a hardhat-deploy project. Each `deployments/<network>/<Name>.json`
 * bundles address + abi + bytecode in a single file, so no artifact lookup is
 * needed. Only networks resolving to the local chain id are imported.
 */
async function parseHardhatDeploy(
  files: DirectoryFile[],
): Promise<DeployedContract[]> {
  // Map each network folder to its chain id via the sibling `.chainId` file.
  const chainIdByNetwork = new Map<string, string>()
  await Promise.all(
    files.map(async (file) => {
      const match = getRelativePath(file).match(HH_DEPLOY_CHAINID_PATTERN)
      if (!match) return
      const chainId = (await file.text()).trim()
      chainIdByNetwork.set(match[1], chainId)
    }),
  )

  const isLocalNetwork = (network: string) => {
    const chainId = chainIdByNetwork.get(network)
    if (chainId) return chainId === LOCAL_CHAIN_ID
    // No .chainId in the selection — fall back to conventional local names.
    return LOCAL_NETWORK_NAMES.has(network.toLowerCase())
  }

  const deploymentFiles = files.filter((file) => {
    const path = getRelativePath(file)
    // `ignition/deployments/...` superficially matches the pattern — skip it,
    // it's handled by parseIgnition.
    if (path.includes('ignition/')) return false
    const match = path.match(HH_DEPLOY_FILE_PATTERN)
    return match ? isLocalNetwork(match[1]) : false
  })

  if (deploymentFiles.length === 0) return []
  console.log('[Hardhat] Found hardhat-deploy artifacts:', deploymentFiles.length)

  const contracts: DeployedContract[] = []

  for (const file of deploymentFiles) {
    const match = getRelativePath(file).match(HH_DEPLOY_FILE_PATTERN)
    if (!match) continue

    const deployment = await readJson<HardhatDeployFile>(file)
    if (!deployment?.address) continue

    contracts.push({
      address: deployment.address as Address,
      name: match[2], // file name (without .json) == contract instance name
      abi: deployment.abi,
      bytecode: extractBytecode(deployment),
    })
  }

  return contracts
}

/**
 * Import deployed contracts from a Hardhat project directory. Supports both
 * Hardhat 3 / Ignition and the hardhat-deploy plugin, filtered to the local
 * dev chain (31337).
 */
export async function loadHardhatContractsFromDirectory(
  inputFiles: FileList | File[],
): Promise<DeployedContract[]> {
  console.log('[Hardhat] Starting directory import...')

  if (!inputFiles || inputFiles.length === 0)
    throw new Error('No files selected')

  if (inputFiles.length > MAX_FILES)
    throw new Error(
      `Too many files selected (${inputFiles.length}). Maximum is ${MAX_FILES}. Try selecting a smaller directory or only the 'ignition' / 'deployments' folders.`,
    )

  const files: DirectoryFile[] = Array.from(inputFiles as ArrayLike<File>)

  // Narrow to the directories we care about to reduce work and memory.
  const relevantFiles = files.filter((file) => {
    const path = getRelativePath(file)
    return path.includes('ignition/') || path.includes('deployments/')
  })

  console.log(
    '[Hardhat] Filtered to relevant files:',
    relevantFiles.length,
    'from',
    files.length,
    'total',
  )

  const [ignition, hardhatDeploy] = await Promise.all([
    parseIgnition(relevantFiles),
    parseHardhatDeploy(relevantFiles),
  ])

  const contracts = dedupeByAddress([...ignition, ...hardhatDeploy])

  if (contracts.length === 0)
    throw new Error(
      "No deployed contracts found for chain 31337. Make sure you selected a Hardhat project containing an 'ignition/deployments/chain-31337' or 'deployments/<local-network>' folder.",
    )

  const withAbi = contracts.filter((c) => c.abi).length
  console.log('[Hardhat] Import complete:', {
    total: contracts.length,
    withAbi,
    withoutAbi: contracts.length - withAbi,
  })

  return contracts
}
