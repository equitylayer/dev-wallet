import { Link } from 'react-router-dom'

import { DWLogo } from '~/components/svgs/DWLogo'
import {
  Box,
  Button,
  Inline,
  Inset,
  Row,
  Rows,
  Stack,
  Text,
} from '~/design-system'

export default function OnboardingStart() {
  return (
    <Inset height="full" horizontal="20px" vertical="20px">
      <Rows>
        <Row alignHorizontal="center">
          <Box>
            <DWLogo size="200px" />
          </Box>
        </Row>
        <Row alignVertical="center">
          <Stack gap="32px">
            <Stack gap="20px">
              <Text size="32px" weight="medium">
                DevWallet
              </Text>
              <Text color="text/tertiary" size="18px" weight="light">
                Developer Wallet & DevTools for Anvil & Hardhat designed to
                supercharge your Ethereum development workflow.
              </Text>
            </Stack>
            <Stack gap="24px">
              <Inline alignVertical="center" gap="12px" wrap={false}>
                <Box
                  alignItems="center"
                  backgroundColor="surface/fill/tertiary"
                  display="flex"
                  justifyContent="center"
                  style={{
                    borderRadius: '100%',
                    fontSize: '18px',
                    minWidth: '40px',
                    minHeight: '40px',
                  }}
                >
                  ⚙️
                </Box>
                <Stack gap="12px">
                  <Text size="16px" weight="medium">
                    Configure chains
                  </Text>
                  <Text color="text/tertiary">
                    Customize your Anvil & Hardhat chains
                  </Text>
                </Stack>
              </Inline>
              <Inline alignVertical="center" gap="12px" wrap={false}>
                <Box
                  alignItems="center"
                  backgroundColor="surface/fill/tertiary"
                  display="flex"
                  justifyContent="center"
                  style={{
                    borderRadius: '100%',
                    fontSize: '18px',
                    minWidth: '40px',
                    minHeight: '40px',
                  }}
                >
                  💳
                </Box>
                <Stack gap="12px">
                  <Text size="16px" weight="medium">
                    Manage accounts
                  </Text>
                  <Text color="text/tertiary">
                    Set balances, impersonate, etc.
                  </Text>
                </Stack>
              </Inline>
              <Inline alignVertical="center" gap="12px" wrap={false}>
                <Box
                  alignItems="center"
                  backgroundColor="surface/fill/tertiary"
                  display="flex"
                  justifyContent="center"
                  style={{
                    borderRadius: '100%',
                    fontSize: '18px',
                    minWidth: '40px',
                    minHeight: '40px',
                  }}
                >
                  📦
                </Box>
                <Stack gap="12px">
                  <Text size="16px" weight="medium">
                    Time travel
                  </Text>
                  <Text color="text/tertiary">Snapshot & revert history</Text>
                </Stack>
              </Inline>
            </Stack>
          </Stack>
        </Row>
        <Row alignVertical="bottom" height="content">
          <Stack gap="8px" width="full">
            <Link to="/onboarding/download?node=anvil" style={{ width: '100%' }}>
              <Button height="44px" width="full">
                Set up Anvil
              </Button>
            </Link>
            <Link
              to="/onboarding/download?node=hardhat"
              style={{ width: '100%' }}
            >
              <Button height="44px" variant="stroked fill" width="full">
                Set up Hardhat
              </Button>
            </Link>
          </Stack>
        </Row>
      </Rows>
    </Inset>
  )
}
