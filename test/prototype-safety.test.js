import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const sdkSource = await readFile(
  new URL('../src/e-imzo.js', import.meta.url),
  'utf8',
)

function createSdkContext() {
  const context = vm.createContext({
    window: {
      location: { protocol: 'https:' },
    },
  })

  return context
}

function captureNativePrototypeDescriptors(context) {
  vm.runInContext(
    `globalThis.__nativePrototypeSnapshot = [
      Object.prototype,
      Array.prototype,
      Date.prototype,
      String.prototype,
      Function.prototype,
      RegExp.prototype,
      Number.prototype,
      Boolean.prototype,
      Error.prototype,
      Promise.prototype,
      Map.prototype,
      Set.prototype,
      WeakMap.prototype,
      WeakSet.prototype,
      ArrayBuffer.prototype,
      DataView.prototype,
      Uint8Array.prototype
    ].map(function (prototype) {
      return {
        prototype: prototype,
        keys: Reflect.ownKeys(prototype),
        descriptors: Reflect.ownKeys(prototype).map(function (key) {
          return Object.getOwnPropertyDescriptor(prototype, key)
        })
      }
    })`,
    context,
  )
}

function nativePrototypeDescriptorsAreUnchanged(context) {
  return vm.runInContext(
    `__nativePrototypeSnapshot.every(function (snapshot) {
      var currentKeys = Reflect.ownKeys(snapshot.prototype)
      if (currentKeys.length !== snapshot.keys.length) return false

      return snapshot.keys.every(function (key, index) {
        if (currentKeys[index] !== key) return false

        var before = snapshot.descriptors[index]
        var after = Object.getOwnPropertyDescriptor(snapshot.prototype, key)
        if (!after) return false
        if (
          before.configurable !== after.configurable ||
          before.enumerable !== after.enumerable
        ) return false

        if ('value' in before) {
          return (
            'value' in after &&
            before.writable === after.writable &&
            Object.is(before.value, after.value)
          )
        }

        return (
          !('value' in after) &&
          before.get === after.get &&
          before.set === after.set
        )
      })
    })`,
    context,
  )
}

test('SDK source has no native prototype mutation paths', () => {
  const forbiddenPatterns = [
    /\b(?:Object|Array|Date|String|Function|RegExp)\.prototype(?:\.[A-Za-z_$][\w$]*|\[[^\]]+])\s*=/,
    /Object\.(?:defineProperty|defineProperties|assign)\s*\(\s*(?:Object|Array|Date|String|Function|RegExp)\.prototype/,
    /Reflect\.set\s*\(\s*(?:Object|Array|Date|String|Function|RegExp)\.prototype/,
    /\b__proto__\b/,
    /\bconstructor\s*\.\s*prototype\b/,
    /Object\.setPrototypeOf\s*\(/,
  ]

  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(sdkSource, pattern)
  }
})

test('loading the SDK leaves native prototype descriptors unchanged', () => {
  const context = createSdkContext()
  captureNativePrototypeDescriptors(context)

  vm.runInContext(sdkSource, context)

  assert.equal(nativePrototypeDescriptorsAreUnchanged(context), true)
})

function snapshotNativePrototypeNames(context) {
  return JSON.parse(
    vm.runInContext(
      `JSON.stringify({
        object: Object.getOwnPropertyNames(Object.prototype).sort(),
        array: Object.getOwnPropertyNames(Array.prototype).sort(),
        date: Object.getOwnPropertyNames(Date.prototype).sort(),
        string: Object.getOwnPropertyNames(String.prototype).sort()
      })`,
      context,
    ),
  )
}

function legacySplitFields(value, splitter, ahead) {
  const result = []
  if (splitter !== '') {
    function getSubst(match) {
      const substChar = match[0] === '0' ? '1' : '0'
      let subst = ''
      for (let index = 0; index < match.length; index += 1) {
        subst += substChar
      }
      return subst
    }

    const matches = []
    const replaceName = splitter instanceof RegExp ? 'replace' : 'replaceAll'
    value[replaceName](splitter, (match, index) => {
      matches.push({ value: match, index })
      return getSubst(match)
    })

    let lastIndex = 0
    for (const match of matches) {
      const nextIndex = ahead ? match.index : match.index + match.value.length
      if (nextIndex !== lastIndex) {
        result.push(value.substring(lastIndex, nextIndex))
        lastIndex = nextIndex
      }
    }

    if (lastIndex < value.length) {
      result.push(value.substring(lastIndex))
    }
  }

  return result
}

function legacyGetX500Value(value, field) {
  const parts = legacySplitFields(value, /,[A-Z]+=/g, true)
  for (let index = 0; index < parts.length; index += 1) {
    const prefix = index > 0 ? ',' : ''
    const position = parts[index].search(`${prefix}${field}=`)
    if (position !== -1) {
      return parts[index].slice(
        position + field.length + 1 + (index > 0 ? 1 : 0),
      )
    }
  }
  return ''
}

test('Base64 encode/decode remains available without String extensions', () => {
  const context = createSdkContext()
  const before = snapshotNativePrototypeNames(context)
  vm.runInContext(sdkSource, context)

  const decoded = vm.runInContext(
    `Base64.decode(Base64.encode("O'zbekiston — E-IMZO"))`,
    context,
  )

  assert.equal(decoded, "O'zbekiston — E-IMZO")
  assert.equal(vm.runInContext('Base64.extendString', context), undefined)
  assert.deepEqual(snapshotNativePrototypeNames(context), before)
})

test('legacy dates utility remains available without Date extensions', () => {
  const context = createSdkContext()
  vm.runInContext(sdkSource, context)

  const result = vm.runInContext(
    `({
      before: dates.compare(new Date(2024, 0, 1), new Date(2024, 0, 2)),
      equal: dates.compare([2024, 0, 1], new Date(2024, 0, 1)),
      inRange: dates.inRange(
        new Date(2024, 5, 15),
        new Date(2024, 0, 1),
        new Date(2024, 11, 31)
      )
    })`,
    context,
  )

  assert.equal(result.before, -1)
  assert.equal(result.equal, 0)
  assert.equal(result.inRange, true)
})

test('legacy FTJC certificate discovery is explicit and opt-in', () => {
  const context = createSdkContext()
  vm.runInContext(sdkSource, context)

  const result = JSON.parse(
    vm.runInContext(
      `(() => {
        EIMZOClient.NEW_API = true
        EIMZOClient.NEW_API2 = true

        var tokenCalls = 0
        EIMZOClient._findPfxs2 = function (
          itemIdGen,
          itemUiGen,
          items,
          errors,
          callback
        ) {
          items.push(itemUiGen(itemIdGen({ serialNumber: 'PFX' }, 0), {
            type: 'pfx'
          }))
          callback('pfx')
        }
        EIMZOClient._findTokens2 = function (
          itemIdGen,
          itemUiGen,
          items,
          errors,
          callback
        ) {
          tokenCalls += 1
          items.push(itemUiGen(itemIdGen({ serialNumber: 'FTJC' }, 0), {
            type: 'ftjc'
          }))
          callback('ftjc')
        }

        function list(includeLegacyTokens) {
          var listed
          EIMZOClient.listAllUserKeys(
            function (item) { return item.serialNumber },
            function (id, item) { return item.type },
            function (items) { listed = items },
            function (error, reason) { throw error || new Error(reason) },
            includeLegacyTokens
          )
          return listed
        }

        return JSON.stringify({
          defaultList: list(false),
          legacyList: list(true),
          tokenCalls: tokenCalls
        })
      })()`,
      context,
    ),
  )

  assert.deepEqual(result.defaultList, ['pfx'])
  assert.deepEqual(result.legacyList, ['pfx', 'ftjc'])
  assert.equal(result.tokenCalls, 1)
})

test('PFX password and FTJC PIN verification are explicit and opt-in', () => {
  const context = createSdkContext()
  vm.runInContext(sdkSource, context)

  const result = JSON.parse(
    vm.runInContext(
      `(() => {
        function load(type, verifyPassword) {
          var calls = []
          CAPIWS.callFunction = function (request, success) {
            calls.push(request.name)
            success(null, request.name === 'load_key'
              ? { success: true, keyId: type + '-key' }
              : { success: true })
          }

          EIMZOClient.loadKey(
            type === 'pfx'
              ? { type: type, disk: 'd', path: 'p', name: 'n', alias: 'a' }
              : { type: type, cardUID: 'card' },
            function () {},
            function (error, reason) { throw error || new Error(reason) },
            verifyPassword
          )
          return calls
        }

        return JSON.stringify({
          pfxDefault: load('pfx', false),
          pfxVerified: load('pfx', true),
          ftjcDefault: load('ftjc', false),
          ftjcVerified: load('ftjc', true)
        })
      })()`,
      context,
    ),
  )

  assert.deepEqual(result.pfxDefault, ['load_key'])
  assert.deepEqual(result.pfxVerified, ['load_key', 'verify_password'])
  assert.deepEqual(result.ftjcDefault, ['load_key'])
  assert.deepEqual(result.ftjcVerified, ['load_key', 'verify_pin'])
})

test('X.500 certificate parsing keeps the legacy behavior', () => {
  const context = createSdkContext()
  vm.runInContext(sdkSource, context)

  const cases = [
    {
      value:
        'CN=ALI VALIYEV,SERIALNUMBER=123456,INN=987654321,O=AGRO SERVICE',
      fields: ['CN', 'SERIALNUMBER', 'INN', 'O', 'PINFL'],
    },
    {
      value:
        'CN=DOE, JOHN,PINFL=30101999123456,O=FARM, LLC,VALIDFROM=2024.01.01 00:00:00',
      fields: ['CN', 'PINFL', 'O', 'VALIDFROM'],
    },
    {
      value: 'UID=777,T=DIRECTOR,C=UZ',
      fields: ['UID', 'T', 'C', 'MISSING'],
    },
  ]

  for (const { value, fields } of cases) {
    for (const field of fields) {
      const actual = vm.runInContext(
        `EIMZOClient._getX500Val(${JSON.stringify(value)}, ${JSON.stringify(field)})`,
        context,
      )
      assert.equal(actual, legacyGetX500Value(value, field))
    }
  }
})
