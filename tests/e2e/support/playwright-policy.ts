export const syntheticE2ePolicy = {
  fullyParallel: false,
  workers: 1,
  trace: 'off',
  video: 'off',
  screenshot: 'only-on-failure',
  outputDir: 'test-results/issue-140',
} as const
