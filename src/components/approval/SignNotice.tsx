import { Box, Text } from '~/design-system'
import type { SignNoticeKind } from '~/utils/signRequest'

import { Notice } from './parts'

/**
 * What a message signature needs said before it is signed (`signNotice`): a
 * warning for a payload that looks like a hash, a note that `eth_sign` signs
 * a prefixed personal message, or that the node won't sign it at all.
 */
export function SignNotice({ kind }: { kind: SignNoticeKind | null }) {
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
  if (kind === 'refused')
    return (
      <Box paddingTop="16px">
        <Text color="text/tertiary" size="12px">
          The node signs only hex data: it will refuse this, and the site gets
          its error.
        </Text>
      </Box>
    )
  return null
}
