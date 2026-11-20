import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const lib = (name: string, entry = 'index') =>
  fileURLToPath(new URL(`../../libs/${name}/src/${entry}.ts`, import.meta.url))

// Nommé `vite-node.config.mts` et non `vite.config.mts` : le glob de `vitest.workspace.mts`
// ramasse tout `**/vite.config.*` et en ferait un projet de test fantôme.
export default defineConfig({
  resolve: {
    // `@wa/domain/testing` AVANT `@wa/domain` : un alias Vite capte aussi les sous-chemins.
    alias: {
      '@wa/domain/testing': lib('domain', 'testing'),
      '@wa/domain': lib('domain'),
      '@wa/llm-provider': lib('llm-provider'),
      '@wa/engine': lib('engine'),
    },
  },
})
