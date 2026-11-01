import { Box, Text } from '~/design-system'

import { Notice } from './parts'

/**
 * What a message signature needs said before it is signed (`signNotice`): a
 * warning for a payload that looks like a hash, or a note that `eth_sign`
 * signs a prefixed personal message.
 */
export function SignNotice({ kind }: { kind: 'hash' | 'prefixed' | null }) {
  if (kind === 'hash')
    return (
      <Notice tone="red" title="This looks like a hash">
        <Text size="12px">
          Signing it can authorize a transaction or user operation: a contract
          that checks a hash signed as a personal message, such as Kernel's
          validator for user operations, accepts this signature. Sign only
          hashes you made yourself.
        </Text>
      </Notice>
    )
  if (kind === 'prefixed')
    return (
      <Box paddingTop="16px">
        <Text color="text/tertiary" size="12px">
          eth_sign signs these bytes as a personal message, with the EIP-191
          prefix, as personal_sign does.
        </Text>
      </Box>
    )
  return null
}
