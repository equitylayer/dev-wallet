import { Link, useSearchParams } from 'react-router-dom'
import { OnboardingContainer } from '~/components'
import { Box, Button, Stack, Text } from '~/design-system'

const installs = {
  anvil: {
    title: 'Install Foundry',
    requires: 'DevWallet requires Foundry Anvil to run a local chain.',
    instruction: 'Run the following command in your CLI to install Foundry:',
    command: 'curl -L https://foundry.paradigm.xyz | bash',
  },
  hardhat: {
    title: 'Install Hardhat',
    requires: 'DevWallet works with a Hardhat 3 node to run a local chain.',
    instruction: 'Add Hardhat to your project:',
    command: 'npm install --save-dev hardhat',
  },
} as const

export default function OnboardingDownload() {
  const [params] = useSearchParams()
  const node = params.get('node') === 'hardhat' ? 'hardhat' : 'anvil'
  const install = installs[node]

  return (
    <OnboardingContainer
      title={install.title}
      footer={
        <Link to={`/onboarding/configure?type=local&node=${node}`}>
          <Button height="44px">Continue</Button>
        </Link>
      }
    >
      <Stack gap="20px">
        <Text color="text/secondary" size="14px">
          {install.requires}
        </Text>
        <Text color="text/secondary" size="14px">
          {install.instruction}
        </Text>
        <Box
          as="pre"
          alignItems="center"
          backgroundColor="surface/fill/tertiary"
          display="flex"
          justifyContent="center"
          paddingVertical="16px"
          paddingLeft="12px"
          paddingRight="32px"
          position="relative"
          style={{ textWrap: 'wrap' }}
        >
          <Text family="mono" size="12px">
            {install.command}
          </Text>
          <Box position="absolute" right="12px">
            <Button.Copy
              height="24px"
              variant="ghost primary"
              text={install.command}
            />
          </Box>
        </Box>
        <Text color="text/secondary" size="14px">
          When installed, you can continue.
        </Text>
      </Stack>
    </OnboardingContainer>
  )
}
