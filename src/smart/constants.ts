import type { Address, Hex } from 'viem'

/** Canonical ERC-4337 EntryPoint v0.7. */
export const ENTRY_POINT_07: Address =
  '0x0000000071727De22E5E9d8BAf0edAc6f37da032'
/** The EntryPoint v0.7's helper that runs account `initCode`. */
export const SENDER_CREATOR_07: Address =
  '0xEFC2c1444eBCC4Db75e7613d20C6a62fF67A167C'
/** ZeroDev Kernel v3.3 implementation (the EIP-7702 delegation target). */
export const KERNEL_V3_3: Address = '0xd6CEDDe84be40893d153Be9d467CD6aD37875b28'

/** Last 20 bytes of `keccak256("devwallet.sponsor")`. Funds sponsored ops. */
export const DEVWALLET_SPONSOR: Address =
  '0xA346eBFABDf8D996e8c050431bb1F3E6221c45F3'
/** Last 20 bytes of `keccak256("devwallet.paymaster")`. */
export const DEVWALLET_PAYMASTER: Address =
  '0x281D3b7F84120F81CD8D11CC95926663245c2765'

/** An EIP-7702 delegation is `DELEGATION_PREFIX` followed by the target. */
export const DELEGATION_PREFIX = '0xef0100'

/** Kernel `execute(bytes32,bytes)` mode: batch (`0x01` + 31 zero bytes). */
export const KERNEL_EXECUTE_BATCH_MODE: Hex =
  '0x0100000000000000000000000000000000000000000000000000000000000000'

/** ERC-1271 `isValidSignature` success value. */
export const ERC1271_MAGIC: Hex = '0x1626ba7e'
