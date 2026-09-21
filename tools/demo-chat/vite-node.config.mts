import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const lib = (name: string) => fileURLToPath(new URL(`../../libs/${name}/src/index.ts`, import.meta.url))

// Nommé `vite-node.config.mts` et non `vite.config.mts` : le glob de `vitest.workspace.mts`
// ramasse tout `**/vite.config.*` et en ferait un projet de test fantôme.
export default defineConfig({
  resolve: {
    alias: {
      '@wa/domain': lib('domain'),
      '@wa/llm-provider': lib('llm-provider'),
      '@wa/engine': lib('engine'),
    },
  },
})
