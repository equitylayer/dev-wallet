import { useState } from 'react'
import { Container } from '~/components'
import {
  Box,
  Button,
  Inline,
  Inset,
  Stack,
  Text,
  Toggle,
} from '~/design-system'
import { getTheme, setTheme } from '~/design-system/utils/theme'
import { useSettingsStore } from '~/zustand'

export default function Settings() {
  const {
    bypassConnectAuth,
    bypassSignatureAuth,
    bypassTransactionAuth,
    setBypassConnectAuth,
    setBypassSignatureAuth,
    setBypassTransactionAuth,
  } = useSettingsStore()

  const [currentTheme, setCurrentTheme] = useState(() => {
    const { storageTheme, systemTheme } = getTheme()
    return storageTheme || systemTheme || 'light'
  })

  const handleSetTheme = (theme: 'light' | 'dark') => {
    setTheme(theme)
    setCurrentTheme(theme)
  }

  return (
    <Container dismissable fit header="Settings">
      <Stack gap="16px">
        <Text color="text/tertiary">Appearance</Text>
        <Inset right="4px">
          <Stack gap="4px">
            <Text size="12px">Theme</Text>
            <Inline gap="0px" wrap={false}>
              <Box
                style={{
                  borderTopRightRadius: 0,
                  borderBottomRightRadius: 0,
                  overflow: 'hidden',
                }}
              >
                <Button
                  height="24px"
                  onClick={() => handleSetTheme('light')}
                  variant={
                    currentTheme === 'light' ? 'solid invert' : 'stroked fill'
                  }
                  width="fit"
                >
                  <Box paddingHorizontal="12px">Light</Box>
                </Button>
              </Box>
              <Box
                style={{
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
                  marginLeft: '-1px',
                  overflow: 'hidden',
                }}
              >
                <Button
                  height="24px"
                  onClick={() => handleSetTheme('dark')}
                  variant={
                    currentTheme === 'dark' ? 'solid invert' : 'stroked fill'
                  }
                  width="fit"
                >
                  <Box paddingHorizontal="12px">Dark</Box>
                </Button>
              </Box>
            </Inline>
          </Stack>
        </Inset>
        <Text color="text/tertiary">Cheats</Text>
        <Inset right="4px">
          <Stack gap="8px">
            <Inline
              alignVertical="center"
              alignHorizontal="justify"
              wrap={false}
            >
              <Text size="12px">Bypass Connect Authorization</Text>
              <Toggle
                checked={bypassConnectAuth ?? false}
                onChange={setBypassConnectAuth}
              />
            </Inline>
            <Inline
              alignVertical="center"
              alignHorizontal="justify"
              wrap={false}
            >
              <Text size="12px">Bypass Signature Authorization</Text>
              <Toggle
                checked={bypassSignatureAuth ?? false}
                onChange={setBypassSignatureAuth}
              />
            </Inline>
            <Inline
              alignVertical="center"
              alignHorizontal="justify"
              wrap={false}
            >
              <Text size="12px">Bypass Transaction Authorization</Text>
              <Toggle
                checked={bypassTransactionAuth ?? false}
                onChange={setBypassTransactionAuth}
              />
            </Inline>
          </Stack>
        </Inset>
        <Inline alignHorizontal="center">
          <Text color="text/tertiary" size="11px">
            Version {chrome.runtime.getManifest().version}
          </Text>
        </Inline>
      </Stack>
    </Container>
  )
}
