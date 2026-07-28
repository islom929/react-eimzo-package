import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const providerSource = await readFile(
  new URL('../src/provider.tsx', import.meta.url),
  'utf8',
)

function loadProvider(eimzo) {
  const sourceWithStubbedSdk = providerSource.replace(
    "import * as eimzo from './eimzo'",
    'const eimzo = globalThis.__eimzo',
  )
  const compiled = ts.transpileModule(sourceWithStubbedSdk, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText

  const react = {
    createContext() {
      return { Provider: Symbol('Provider'), current: null }
    },
    useCallback(callback) {
      return callback
    },
    useContext(context) {
      return context.current
    },
    useEffect(effect) {
      effect()
    },
    useRef(value) {
      return { current: value }
    },
    useState(initialValue) {
      let value =
        typeof initialValue === 'function' ? initialValue() : initialValue
      return [
        value,
        (nextValue) => {
          value =
            typeof nextValue === 'function'
              ? nextValue(value)
              : nextValue
        },
      ]
    },
  }
  const jsxRuntime = {
    Fragment: Symbol('Fragment'),
    jsx(type, props) {
      return { type, props }
    },
    jsxs(type, props) {
      return { type, props }
    },
  }
  const exports = {}
  const context = vm.createContext({
    __eimzo: eimzo,
    exports,
    module: { exports },
    require(specifier) {
      if (specifier === 'react') return react
      if (specifier === 'react/jsx-runtime') return jsxRuntime
      throw new Error(`Unexpected import: ${specifier}`)
    },
  })

  vm.runInContext(compiled, context)

  const rendered = exports.EimzoProvider({
    apiKeys: ['docs.agro.uz', 'KEY'],
    children: null,
  })
  return rendered.props.value
}

function createEimzoStub(overrides = {}) {
  return {
    install: async () => ({ major: '4', minor: '86' }),
    checkIdCard: async () => false,
    checkBaikToken: async () => false,
    checkCkc: async () => false,
    listAllUserKeys: async () => [],
    loadKey: async () => 'loaded-key',
    createPkcs7: async () => 'pkcs7',
    ...overrides,
  }
}

test('device probes do not block key loading', async () => {
  const never = new Promise(() => {})
  let listCalls = 0
  const context = loadProvider(
    createEimzoStub({
      checkIdCard: () => never,
      checkBaikToken: () => never,
      checkCkc: () => never,
      listAllUserKeys: async () => {
        listCalls += 1
        return []
      },
    }),
  )

  await Promise.race([
    context.loadKeys(),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('key loading was blocked')), 100)
    }),
  ])

  assert.equal(listCalls, 1)
})

test('loadKeys preserves failure compatibility while reloadKeys rejects', async () => {
  const context = loadProvider(
    createEimzoStub({
      listAllUserKeys: async () => {
        throw 'certificate listing failed'
      },
    }),
  )

  await context.loadKeys()
  await assert.rejects(
    context.reloadKeys(),
    (error) => error === 'certificate listing failed',
  )
})

test('certificate cache refreshes when legacy tokens are requested', async () => {
  const options = []
  const context = loadProvider(
    createEimzoStub({
      listAllUserKeys: async (loadOptions) => {
        options.push(loadOptions)
        return []
      },
    }),
  )

  await context.loadKeys()
  await context.loadKeys()
  await context.loadKeys({ includeLegacyTokens: true })
  await context.loadKeys({ includeLegacyTokens: true })
  await context.reloadKeys({ includeLegacyTokens: true })

  assert.deepEqual(
    options.map((option) => option.includeLegacyTokens === true),
    [false, true, true],
  )
})

test('prepareKey and signAsync normalize SDK failures as Error objects', async () => {
  const context = loadProvider(
    createEimzoStub({
      loadKey: async () => {
        throw 'Wrong PIN'
      },
    }),
  )
  const certificate = { type: 'pfx' }

  await assert.rejects(
    context.prepareKey(certificate, true),
    /Wrong PIN/,
  )
  await assert.rejects(
    context.signAsync({
      keyId: certificate,
      data: 'payload',
      verifyPassword: true,
    }),
    /Wrong PIN/,
  )
})

test('legacy sign keeps its runtime Promise and callback behavior', async () => {
  const calls = []
  const context = loadProvider(
    createEimzoStub({
      loadKey: async (_certificate, verifyPassword) => {
        calls.push(verifyPassword)
        return 'loaded-key'
      },
      createPkcs7: async () => 'signature',
    }),
  )

  let result
  const operation = context.sign({
    keyId: { type: 'pfx' },
    data: 'payload',
    onSuccess(signature) {
      result = signature
    },
  })

  assert.equal(typeof operation?.then, 'function')
  await operation
  assert.deepEqual(calls, [false])
  assert.equal(result, 'signature')
})
