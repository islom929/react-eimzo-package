import type { ICertificate } from './types'
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
      (e, r) => reject(r || e),
    )
  })
}

export function installApiKeys(apiKeys?: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (apiKeys) {
      EIMZOClient.API_KEYS = [
        ...EIMZOClient.API_KEYS,
        ...apiKeys,
      ]
    }
    EIMZOClient.installApiKeys(
      () => resolve(),
      (e, r) => reject(r || e),
    )
  })
}

export function listAllUserKeys(): Promise<ICertificate[]> {
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
    )
  })
}

export function loadKey(cert: ICertificate): Promise<string> {
  return new Promise((resolve, reject) => {
    EIMZOClient.loadKey(
      cert,
      (id) => resolve(id),
      (e, r) => reject(r || e),
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

export async function install(
  apiKeys?: string[],
): Promise<{ major: string; minor: string }> {
  await loadSDK()
  const version = await checkVersion()

  const installed = parseInt(version.major) * 100 + parseInt(version.minor)
  if (installed < MIN_VERSION) {
    throw `E-IMZO version too old (${version.major}.${version.minor}). Minimum: 3.36`
  }

  await installApiKeys(apiKeys)
  return version
}
