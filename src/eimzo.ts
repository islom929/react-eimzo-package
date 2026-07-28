import type { ICertificate, ILoadKeysOptions } from './types'
import { SDK_SOURCE } from './sdk-content'

let sdkLoaded = false

export function loadSDK(): Promise<void> {
  return new Promise((resolve) => {
    if (sdkLoaded || typeof EIMZOClient !== 'undefined') {
      sdkLoaded = true
      resolve()
      return
    }

    const script = document.createElement('script')
    script.textContent = SDK_SOURCE
    document.head.appendChild(script)
    sdkLoaded = true
    resolve()
  })
}

export function checkVersion(): Promise<{ major: string; minor: string }> {
  return new Promise((resolve, reject) => {
    EIMZOClient.checkVersion(
      (major, minor) => resolve({ major, minor }),
      (e, r) => {
        if (!r && typeof e === 'number') {
          reject(
            'E-IMZO не запущен. Убедитесь, что приложение E-IMZO установлено и запущено.',
          )
        } else {
          reject(r || e)
        }
      },
    )
  })
}

function mergeApiKeys(apiKeys?: string[]): void {
  if (!apiKeys || apiKeys.length === 0) return
  if (apiKeys.length % 2 !== 0) {
    throw new Error('apiKeys must contain domain/key pairs')
  }

  for (let index = 0; index < apiKeys.length; index += 2) {
    const domain = apiKeys[index]
    const key = apiKeys[index + 1]
    const existingDomainIndex = EIMZOClient.API_KEYS.findIndex(
      (entry, entryIndex) => entryIndex % 2 === 0 && entry === domain,
    )

    if (existingDomainIndex >= 0) {
      EIMZOClient.API_KEYS[existingDomainIndex + 1] = key
    } else {
      EIMZOClient.API_KEYS.push(domain, key)
    }
  }
}

export function installApiKeys(apiKeys?: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      mergeApiKeys(apiKeys)
    } catch (error) {
      reject(error)
      return
    }

    EIMZOClient.installApiKeys(
      () => resolve(),
      (e, r) => reject(r || e),
    )
  })
}

export function listAllUserKeys(
  options?: Pick<ILoadKeysOptions, 'includeLegacyTokens'>,
): Promise<ICertificate[]> {
  return new Promise((resolve, reject) => {
    const certs: ICertificate[] = []

    EIMZOClient.listAllUserKeys(
      (o, i) => `itm-${o.serialNumber}-${i}`,
      (_itemId, vo) => {
        const cert: ICertificate = {
          ...vo,
          expired: new Date(vo.validTo) < new Date(),
        }
        certs.push(cert)
        return cert
      },
      () => resolve(certs),
      (e, r) => reject(r || e),
      options?.includeLegacyTokens,
    )
  })
}

export function loadKey(
  cert: ICertificate,
  verifyPassword = false,
): Promise<string> {
  return new Promise((resolve, reject) => {
    EIMZOClient.loadKey(
      cert,
      (id) => resolve(id),
      (e, r) => reject(r || e),
      verifyPassword,
    )
  })
}

export function createPkcs7(keyId: string, data: string): Promise<string> {
  return new Promise((resolve, reject) => {
    EIMZOClient.createPkcs7(
      keyId,
      data,
      null,
      (pkcs7) => resolve(pkcs7),
      (e, r) => reject(r || e),
      false,
    )
  })
}

export function checkIdCard(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    EIMZOClient.idCardIsPLuggedIn(
      (plugged) => resolve(plugged),
      (e, r) => reject(r || e),
    )
  })
}

export function checkBaikToken(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    EIMZOClient.isBAIKTokenPLuggedIn(
      (plugged) => resolve(plugged),
      (e, r) => reject(r || e),
    )
  })
}

export function checkCkc(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    EIMZOClient.isCKCPLuggedIn(
      (plugged) => resolve(plugged),
      (e, r) => reject(r || e),
    )
  })
}

const MIN_VERSION = 336

type EimzoVersion = { major: string; minor: string }

let installedVersion: EimzoVersion | null = null
let versionPromise: Promise<EimzoVersion> | null = null
let apiKeysInstallPromise: Promise<void> | null = null
let installedApiKeysFingerprint: string | null = null

async function ensureSupportedVersion(): Promise<EimzoVersion> {
  if (installedVersion) return installedVersion
  if (versionPromise) return versionPromise

  versionPromise = (async () => {
    try {
      await loadSDK()
      const version = await checkVersion()

      const installed = parseInt(version.major) * 100 + parseInt(version.minor)
      if (installed < MIN_VERSION) {
        throw `Версия E-IMZO устарела (${version.major}.${version.minor}). Минимальная версия: 3.36`
      }

      installedVersion = version
      return version
    } catch (error) {
      versionPromise = null
      throw error
    }
  })()

  return versionPromise
}

async function ensureApiKeysInstalled(apiKeys?: string[]): Promise<void> {
  while (apiKeysInstallPromise) {
    try {
      await apiKeysInstallPromise
    } catch {
      // A later call may retry after the previous installation failed.
    }
  }

  mergeApiKeys(apiKeys)
  const fingerprint = JSON.stringify(EIMZOClient.API_KEYS)

  if (installedApiKeysFingerprint === fingerprint) return

  const promise = installApiKeys()
  apiKeysInstallPromise = promise

  try {
    await promise
    installedApiKeysFingerprint = fingerprint
  } finally {
    if (apiKeysInstallPromise === promise) {
      apiKeysInstallPromise = null
    }
  }
}

export async function install(
  apiKeys?: string[],
): Promise<EimzoVersion> {
  const version = await ensureSupportedVersion()
  await ensureApiKeysInstalled(apiKeys)
  return version
}

export function resetInstall(): void {
  installedVersion = null
  versionPromise = null
  installedApiKeysFingerprint = null
}
