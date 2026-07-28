import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const eimzoSource = await readFile(
  new URL('../src/eimzo.ts', import.meta.url),
  'utf8',
)

function loadEimzoModule({ apiKeyFailures = 0 } = {}) {
  const sourceWithoutSdkImport = eimzoSource.replace(
    "import { SDK_SOURCE } from './sdk-content'",
    "const SDK_SOURCE = ''",
  )
  const compiled = ts.transpileModule(sourceWithoutSdkImport, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText

  const calls = {
    checkVersion: 0,
    installApiKeys: [],
  }
  let remainingApiKeyFailures = apiKeyFailures

  const EIMZOClient = {
    API_KEYS: ['localhost', 'LOCAL_KEY'],
    checkVersion(success) {
      calls.checkVersion += 1
      success('4', '86')
    },
    installApiKeys(success, fail) {
      calls.installApiKeys.push([...this.API_KEYS])
      if (remainingApiKeyFailures > 0) {
        remainingApiKeyFailures -= 1
        fail(null, 'API key installation failed')
        return
      }
      success()
    },
  }
  const exports = {}
  const context = vm.createContext({
    EIMZOClient,
    exports,
    module: { exports },
  })

  vm.runInContext(compiled, context)

  return {
    api: exports,
    calls,
    EIMZOClient,
  }
}

test('install deduplicates parallel calls and updates a domain key once', async () => {
  const { api, calls, EIMZOClient } = loadEimzoModule()
  const firstPair = ['docs.agro.uz', 'FIRST_KEY']

  await Promise.all([api.install(firstPair), api.install([...firstPair])])

  assert.equal(calls.checkVersion, 1)
  assert.equal(calls.installApiKeys.length, 1)

  await api.install([...firstPair])
  assert.equal(calls.installApiKeys.length, 1)

  await api.install(['docs.agro.uz', 'ROTATED_KEY'])
  assert.equal(calls.installApiKeys.length, 2)
  assert.equal(
    EIMZOClient.API_KEYS.filter((entry) => entry === 'docs.agro.uz').length,
    1,
  )
  assert.equal(
    EIMZOClient.API_KEYS[
      EIMZOClient.API_KEYS.indexOf('docs.agro.uz') + 1
    ],
    'ROTATED_KEY',
  )
})

test('install retries API key setup after a failure', async () => {
  const { api, calls } = loadEimzoModule({ apiKeyFailures: 1 })

  await assert.rejects(
    api.install(['docs.agro.uz', 'KEY']),
    (error) => error === 'API key installation failed',
  )
  await api.install(['docs.agro.uz', 'KEY'])

  assert.equal(calls.checkVersion, 1)
  assert.equal(calls.installApiKeys.length, 2)
})

test('install rejects malformed domain/key input without calling API setup', async () => {
  const { api, calls } = loadEimzoModule()

  await assert.rejects(
    api.install(['docs.agro.uz']),
    /apiKeys must contain domain\/key pairs/,
  )

  assert.equal(calls.installApiKeys.length, 0)
})
