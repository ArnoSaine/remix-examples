import { createAssetServer } from 'remix/assets'
import { uiHmr } from 'remix/ui-hmr/assets'

const rootDir = process.cwd()
const nodeEnv = process.env.NODE_ENV ?? 'development'
const isDevelopment = nodeEnv === 'development'
const isHmr = Boolean(isDevelopment && process.env.REMIX_NODE_HMR)

export const assets = createAssetServer({
  basePath: '/assets',
  rootDir,
  mounts: {
    app: 'app',
    npm: 'node_modules',
    packages: 'packages',
  },

  allowFiles: ['app/routes.ts', 'app/**/public/**'],
  allowPackages: ['remix', '@example/fluent-remix', '@fluent/bundle', '@fluent/dom'],
  denyFiles: ['app/**/*.test.*'],
  sourceMaps: isDevelopment ? 'external' : undefined,
  minify: !isDevelopment,
  watch: isDevelopment,
  hmr: isHmr
    ? {
        channel: async () => (await import('remix/node-hmr/runtime')).createBrowserHmrChannel(),
        moduleImporter: 'remix/multiple-import-maps-polyfill',
      }
    : undefined,
  scripts: { loaders: isHmr ? [uiHmr()] : undefined },
})

const entry = 'app/actions/public/entry.ts'

export const scriptEntry = await assets.getScriptEntry(entry)
