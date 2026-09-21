import { defineConfig } from 'vitest/config'
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin'
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin'
import { coverageEnabledForTarget } from '../../tools/vitest/nx-coverage.mts'

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/engine',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    name: 'engine',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      enabled: coverageEnabledForTarget(),
      reportsDirectory: '../../coverage/libs/engine',
      provider: 'v8' as const,
      thresholds: { lines: 90, functions: 90, branches: 85 },
    },
  },
}))
