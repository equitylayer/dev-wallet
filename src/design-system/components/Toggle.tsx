import { Box } from './Box'

type ToggleProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <Box
      as="button"
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      cursor={disabled ? 'not-allowed' : 'pointer'}
      opacity={disabled ? '0.5' : undefined}
      style={{
        position: 'relative',
        width: '37px',
        height: '20px',
        borderRadius: '4px',
        backgroundColor: checked
          ? 'rgb(var(--toggle-active-bg))'
          : 'rgb(var(--toggle-inactive-bg))',
        border: 'none',
        transition: 'background-color 200ms ease',
        outline: 'none',
      }}
    >
      <Box
        style={{
          position: 'absolute',
          top: '2px',
          left: checked ? '19px' : '2px',
          width: '16px',
          height: '16px',
          borderRadius: '2px',
          backgroundColor: checked
            ? 'rgb(var(--toggle-active-knob))'
            : 'white',
          transition: 'left 200ms ease',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
        }}
      />
    </Box>
  )
}
