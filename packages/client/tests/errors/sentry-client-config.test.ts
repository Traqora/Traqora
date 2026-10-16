const initMock = jest.fn()
const feedbackIntegrationMock = jest.fn(() => ({ name: 'Feedback' }))

jest.mock('@sentry/nextjs', () => ({
  init: (...args: unknown[]) => initMock(...args),
  feedbackIntegration: (...args: unknown[]) => feedbackIntegrationMock(...args),
}))

describe('sentry.client.config (issue #334 feedback widget)', () => {
  const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN

  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://example.ingest.sentry.io/1'
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn
  })

  it('registers the feedback widget integration with auto-inject enabled', async () => {
    await import('../../sentry.client.config')

    expect(feedbackIntegrationMock).toHaveBeenCalledWith(
      expect.objectContaining({ autoInject: true }),
    )
    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        integrations: [{ name: 'Feedback' }],
      }),
    )
  })
})
