import { useState } from 'react'
import { Container } from '~/components'
import {
    Box,
    Button,
    Inline,
    Input,
    Inset,
    Stack,
    Text,
    Toggle,
} from '~/design-system'
import { getTheme, setTheme } from '~/design-system/utils/theme'
import { webextStorage } from '~/storage'
import { useSettingsStore } from '~/zustand'

export default function Settings() {
    const {
        bypassConnectAuth,
        bypassSignatureAuth,
        bypassTransactionAuth,
        etherscanApiKey,
        setBypassConnectAuth,
        setBypassSignatureAuth,
        setBypassTransactionAuth,
        setEtherscanApiKey,
    } = useSettingsStore()

    const [etherscanApiKeyDraft, setEtherscanApiKeyDraft] = useState(
        etherscanApiKey ?? '',
    )

    const [currentTheme, setCurrentTheme] = useState(() => {
        const { storageTheme, systemTheme } = getTheme()
        return storageTheme || systemTheme || 'light'
    })

    const handleSetTheme = (theme: 'light' | 'dark') => {
        setTheme(theme)
        setCurrentTheme(theme)
    }

    const [confirmingReset, setConfirmingReset] = useState(false)

    const handleReset = async () => {
        await webextStorage.local.clear()
        window.location.reload()
    }

    return (
        <Container
            dismissable
            fit
            header="Settings"
            footer={
                <Inline alignHorizontal="justify" alignVertical="center" wrap={false}>
                    <Text color="text/tertiary" size="11px">
                        Version {chrome.runtime.getManifest().version}
                    </Text>
                    <a
                        href="https://github.com/equitylayer"
                        target="_blank"
                        rel="noreferrer noopener"
                        style={{ textDecoration: 'none' }}
                    >
                        <Inline gap="6px" alignVertical="center" wrap={false}>
                            <img
                                src={
                                    currentTheme === 'dark'
                                        ? '/logo-white.png'
                                        : '/obolos-logo.png'
                                }
                                alt=""
                                height={14}
                                width={14}
                                style={{ display: 'block' }}
                            />
                            <Text color="text/tertiary" size="11px">
                                by obolos ↗
                            </Text>
                        </Inline>
                    </a>
                </Inline>
            }
        >
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
                <Text color="text/tertiary">ABI Loaders</Text>
                <Inset right="4px">
                    <Stack gap="6px">
                        <Inline
                            alignVertical="center"
                            alignHorizontal="justify"
                            wrap={false}
                        >
                            <Text size="12px">Etherscan API key</Text>
                            <a
                                href="https://etherscan.io/myapikey"
                                target="_blank"
                                rel="noreferrer noopener"
                                style={{ textDecoration: 'none' }}
                            >
                                <Text color="text/tertiary" size="11px">
                                    Get one ↗
                                </Text>
                            </a>
                        </Inline>
                        <Input
                            height="24px"
                            type="password"
                            placeholder="Paste key..."
                            value={etherscanApiKeyDraft}
                            onChange={(e) => setEtherscanApiKeyDraft(e.target.value)}
                            onBlur={() => setEtherscanApiKey(etherscanApiKeyDraft.trim())}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter')
                                    (e.target as HTMLInputElement).blur()
                            }}
                        />
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
                <Text color="text/tertiary">Reset</Text>
                <Inset right="4px">
                    <Stack gap="8px">
                        <Text color="text/tertiary" size="11px">
                            Clears all accounts, contracts, networks, tokens & settings, then
                            restarts onboarding.
                        </Text>
                        {confirmingReset ? (
                            <Inline gap="8px" wrap={false}>
                                <Button
                                    height="24px"
                                    onClick={() => setConfirmingReset(false)}
                                    variant="stroked fill"
                                    width="fit"
                                >
                                    <Box paddingHorizontal="12px">Cancel</Box>
                                </Button>
                                <Button
                                    height="24px"
                                    onClick={handleReset}
                                    variant="solid red"
                                    width="fit"
                                >
                                    <Box paddingHorizontal="12px">Confirm reset</Box>
                                </Button>
                            </Inline>
                        ) : (
                            <Box>
                                <Button
                                    height="24px"
                                    onClick={() => setConfirmingReset(true)}
                                    variant="stroked red"
                                    width="fit"
                                >
                                    <Box paddingHorizontal="12px">Reset all data</Box>
                                </Button>
                            </Box>
                        )}
                    </Stack>
                </Inset>
            </Stack>
        </Container>
    )
}
