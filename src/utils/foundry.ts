import type { Abi, Address, Hex } from 'viem'

import {
  type DeployedContract,
  type DirectoryFile,
  extractBytecode,
  getRelativePath,
  MAX_FILE_SIZE,
  MAX_FILES,
} from './deployments'

export type FoundryDeployedContract = DeployedContract

type FoundryTransaction = {
  transactionType: string
  contractName?: string
  contractAddress?: string
  transaction?: {
    data?: Hex
  }
}

type FoundryBroadcast = {
  transactions: FoundryTransaction[]
}

/**
 * Parse Foundry broadcast file (broadcast/31337/run-latest.json)
 * and extract deployed contracts
 */
export async function parseFoundryBroadcast(
  file: File,
): Promise<FoundryDeployedContract[]> {
  try {
    console.log('[Foundry] Parsing broadcast file:', file.name)

    if (!file || file.size === 0) {
      throw new Error('Broadcast file is empty or invalid')
    }

    const broadcastContent = await file.text()

    let broadcast: FoundryBroadcast
    try {
      broadcast = JSON.parse(broadcastContent) as FoundryBroadcast
    } catch (parseError) {
      console.error('[Foundry] JSON parse error:', parseError)
      throw new Error(
        'Invalid JSON in broadcast file. Make sure the file is a valid Foundry broadcast.',
      )
    }

    if (!broadcast.transactions || !Array.isArray(broadcast.transactions)) {
      console.error('[Foundry] Invalid broadcast structure:', broadcast)
      throw new Error(
        'Broadcast file does not contain a valid transactions array',
      )
    }

    const contracts: FoundryDeployedContract[] = []

    for (const tx of broadcast.transactions) {
      if (
        (tx.transactionType === 'CREATE' || tx.transactionType === 'CREATE2') &&
        tx.contractName &&
        tx.contractAddress
      ) {
        console.log(
          '[Foundry] Found deployed contract:',
          tx.contractName,
          tx.contractAddress,
        )
        contracts.push({
          address: tx.contractAddress as Address,
          name: tx.contractName,
          bytecode: tx.transaction?.data,
        })
      }
    }

    console.log(
      '[Foundry] Extracted',
      contracts.length,
      'contracts from broadcast',
    )
    return contracts
  } catch (error) {
    console.error('[Foundry] Failed to parse broadcast file:', file.name, error)
    if (error instanceof Error) {
      throw new Error(`Failed to parse broadcast file: ${error.message}`)
    }
    throw new Error('Failed to parse broadcast file: Unknown error')
  }
}

/**
 * Load ABIs from selected files and match to contracts
 */
const FOUND_BROADCAST_PATTERN = /broadcast\//
const FOUND_RUN_LATEST_PATTERN = /\/31337\/run-latest\.json$/

function isBroadcastRunLatest(file: DirectoryFile) {
  const relativePath = getRelativePath(file)
  return (
    FOUND_BROADCAST_PATTERN.test(relativePath) &&
    FOUND_RUN_LATEST_PATTERN.test(relativePath)
  )
}

function findArtifactFile(files: DirectoryFile[], contractName: string) {
  const artifactSuffix = `out/${contractName}.sol/${contractName}.json`
  return files.find((file) => getRelativePath(file).endsWith(artifactSuffix))
}

type FoundryArtifact = {
  abi?: Abi
  bytecode?: Hex | { object?: Hex }
  deployedBytecode?: Hex | { object?: Hex }
}

const MAX_CONCURRENT_ABI_LOADS = 1 // Process files one at a time to prevent crashes

export async function loadFoundryContractsFromDirectory(
  inputFiles: FileList | File[],
): Promise<FoundryDeployedContract[]> {
  try {
    console.log('[Foundry] Starting directory import...')

    if (!inputFiles || inputFiles.length === 0) {
      throw new Error('No files selected')
    }

    console.log('[Foundry] File count:', inputFiles.length)

    if (inputFiles.length > MAX_FILES) {
      throw new Error(
        `Too many files selected (${inputFiles.length}). Maximum is ${MAX_FILES}. Try selecting a smaller directory or only the 'broadcast' and 'out' folders.`,
      )
    }

    // Convert to array in chunks to avoid memory issues
    const files: DirectoryFile[] = []
    console.log('[Foundry] Converting file list...')
    for (let i = 0; i < inputFiles.length; i++) {
      files.push(inputFiles[i] as DirectoryFile)
      // Log progress for large file sets
      if (i > 0 && i % 100 === 0) {
        console.log(`[Foundry] Processed ${i}/${inputFiles.length} files...`)
      }
    }
    console.log('[Foundry] Total files in selection:', files.length)

    // Filter to only relevant files first to reduce memory usage
    const relevantFiles = files.filter((f) => {
      const path = getRelativePath(f)
      // Only include files from broadcast or out directories
      return (
        path.includes('broadcast/') ||
        path.includes('out/') ||
        path.includes('/broadcast/') ||
        path.includes('/out/')
      )
    })

    console.log(
      '[Foundry] Filtered to relevant files:',
      relevantFiles.length,
      'from',
      files.length,
      'total',
    )

    const broadcastFiles = relevantFiles.filter(isBroadcastRunLatest)
    console.log('[Foundry] Found broadcast files:', broadcastFiles.length)

    if (broadcastFiles.length === 0) {
      const samplePaths = relevantFiles
        .slice(0, 20)
        .map((f) => getRelativePath(f))
      console.error(
        '[Foundry] No broadcast files found. Sample paths:',
        samplePaths,
      )
      throw new Error(
        'Could not find broadcast/31337/run-latest.json in the selected files. Make sure you selected a Foundry project directory containing the broadcast folder.',
      )
    }

    const contractsByAddress = new Map<string, FoundryDeployedContract>()

    for (let i = 0; i < broadcastFiles.length; i++) {
      const broadcastFile = broadcastFiles[i]
      try {
        console.log(
          `[Foundry] Processing broadcast file ${i + 1}/${
            broadcastFiles.length
          }:`,
          getRelativePath(broadcastFile),
        )

        // Check file size before processing
        if (broadcastFile.size > MAX_FILE_SIZE) {
          console.warn(
            '[Foundry] Skipping large broadcast file:',
            getRelativePath(broadcastFile),
            `(${Math.round(broadcastFile.size / 1024 / 1024)}MB)`,
          )
          continue
        }

        const contracts = await parseFoundryBroadcast(broadcastFile)
        contracts.forEach((contract) => {
          const key = contract.address.toLowerCase()
          if (!contractsByAddress.has(key)) {
            contractsByAddress.set(key, contract)
            console.log(
              '[Foundry] Registered contract:',
              contract.name,
              contract.address,
            )
          }
        })

        // Delay between broadcast files to allow garbage collection
        if (i < broadcastFiles.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 300))
        }
      } catch (error) {
        console.error(
          '[Foundry] Error processing broadcast file:',
          getRelativePath(broadcastFile),
          error,
        )
        throw error // Re-throw to stop processing
      }
    }

    if (contractsByAddress.size === 0) {
      throw new Error(
        'No deployed contracts found in broadcast files. Make sure you have deployed contracts to chainId 31337.',
      )
    }

    console.log(
      '[Foundry] Loading ABIs for',
      contractsByAddress.size,
      'contracts...',
    )

    // Process ABIs in batches to avoid memory issues
    const contracts = Array.from(contractsByAddress.values())
    const enrichedContracts: FoundryDeployedContract[] = []

    for (let i = 0; i < contracts.length; i += MAX_CONCURRENT_ABI_LOADS) {
      const batch = contracts.slice(i, i + MAX_CONCURRENT_ABI_LOADS)
      console.log(
        `[Foundry] Processing batch ${
          Math.floor(i / MAX_CONCURRENT_ABI_LOADS) + 1
        }/${Math.ceil(contracts.length / MAX_CONCURRENT_ABI_LOADS)}`,
      )

      const batchResults = await Promise.all(
        batch.map(async (contract) => {
          const artifactFile = findArtifactFile(relevantFiles, contract.name)

          if (!artifactFile) {
            console.warn('[Foundry] No artifact file found for:', contract.name)
            return contract
          }

          try {
            // Check file size before processing
            if (artifactFile.size > MAX_FILE_SIZE) {
              console.warn(
                '[Foundry] Skipping large artifact file for:',
                contract.name,
                `(${Math.round(artifactFile.size / 1024 / 1024)}MB)`,
              )
              return contract
            }

            console.log(
              '[Foundry] Loading artifact for:',
              contract.name,
              'from',
              getRelativePath(artifactFile),
            )
            const artifactContent = await artifactFile.text()

            let artifact: FoundryArtifact
            try {
              artifact = JSON.parse(artifactContent) as FoundryArtifact
            } catch (parseError) {
              console.error(
                '[Foundry] JSON parse error for artifact:',
                contract.name,
                parseError,
              )
              return contract // Return without ABI if artifact is invalid
            }

            const enriched = {
              ...contract,
              abi: artifact.abi ?? contract.abi,
              bytecode: contract.bytecode ?? extractBytecode(artifact),
            }

            console.log(
              '[Foundry] Successfully loaded artifact for:',
              contract.name,
              {
                hasAbi: !!enriched.abi,
                hasBytecode: !!enriched.bytecode,
              },
            )

            return enriched
          } catch (error) {
            console.error(
              '[Foundry] Failed to load artifact for',
              contract.name,
              ':',
              error,
            )
            return contract // Return without ABI if loading fails
          }
        }),
      )

      enrichedContracts.push(...batchResults)

      // Delay between batches to allow garbage collection
      if (i + MAX_CONCURRENT_ABI_LOADS < contracts.length) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    const withAbi = enrichedContracts.filter((c) => c.abi).length
    console.log('[Foundry] Import complete:', {
      total: enrichedContracts.length,
      withAbi,
      withoutAbi: enrichedContracts.length - withAbi,
    })

    return enrichedContracts
  } catch (error) {
    console.error('[Foundry] Directory import failed:', error)
    if (error instanceof Error) {
      throw error // Re-throw with original message
    }
    throw new Error('Failed to import Foundry contracts: Unknown error')
  }
}
