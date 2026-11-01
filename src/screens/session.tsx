import { Fragment } from 'react'
import { connect, disconnect } from '~/actions'
import { Container, LabelledContent } from '~/components'
import { Box, Button, Inline, Separator, Stack, Text } from '~/design-system'
import { useHost } from '~/hooks/useHost'
import { useSessionsStore } from '~/zustand'

export default function Session() {
  const { data: host } = useHost()
  const { getSession, sessions } = useSessionsStore()
  const isConnected = Boolean(host && getSession({ host }))

  return (
    <>
      <Box>
        <Container dismissable fit header={host}>
          {isConnected ? (
            <Button
              onClick={() =>
                host && disconnect({ host })
              }
              variant="solid fill"
            >
              Disconnect
            </Button>
          ) : (
            <Button
              variant="solid fill"
              onClick={() =>
                host && connect({ host })
              }
            >
              Connect
            </Button>
          )}
        </Container>
      </Box>
      <Box>
        <Container fit header="Sessions">
          <Stack gap="16px">
            {Object.values(sessions).map((session) => {
              return (
                <Fragment key={session.host}>
                  <Inline
                    alignVertical="center"
                    alignHorizontal="justify"
                    wrap={false}
                  >
                    <LabelledContent label="Host" width="fit">
                      <Text size="12px">
                        {session.host}
                      </Text>
                    </LabelledContent>
                    <Button.Symbol
                      label="Remove"
                      height="24px"
                      symbol="trash"
                      onClick={() => {
                        disconnect({ host: session.host })
                      }}
                      variant="ghost red"
                    />
                  </Inline>
                  <Separator />
                </Fragment>
              )
            })}
          </Stack>
        </Container>
      </Box>
    </>
  )
}
