import { useEffect, useRef, useState } from 'react'

import { Box, Button } from '~/design-system'
import type { ButtonHeight } from '~/design-system/components/Button.css'

/** Whether a destructive action is asking to be confirmed. */
export function useConfirm() {
  const [asking, setAsking] = useState(false)
  return {
    asking,
    ask: () => setAsking(true),
    cancel: () => setAsking(false),
  }
}

/**
 * The final confirmation of a destructive action, in its place: the action
 * in solid red, and Cancel, which takes the focus so a stray Enter can't
 * confirm. Esc cancels.
 */
export function ConfirmActions({
  confirm,
  height,
  disabled = false,
  onConfirm,
  onCancel,
}: {
  confirm: string
  height: ButtonHeight
  disabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  // The design system's buttons type their element as a div.
  const cancelRef = useRef<HTMLDivElement>(null)
  useEffect(() => cancelRef.current?.focus(), [])

  return (
    <Box
      display="flex"
      gap="6px"
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Escape') onCancel()
      }}
    >
      <Button
        disabled={disabled}
        height={height}
        variant="solid red"
        width="fit"
        onClick={onConfirm}
      >
        {confirm}
      </Button>
      <Button
        ref={cancelRef}
        height={height}
        variant="stroked fill"
        width="fit"
        onClick={onCancel}
      >
        Cancel
      </Button>
    </Box>
  )
}
