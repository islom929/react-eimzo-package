import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import type {
  ICertificate,
  ISignParams,
  IEimzoContext,
  IDeviceStatus,
  IEimzoVersion,
} from './types'
import * as eimzo from './eimzo'

const EimzoContext = createContext<IEimzoContext | null>(null)

interface IEimzoProviderProps {
  apiKeys?: string[]
  children: ReactNode
}

export function EimzoProvider({ apiKeys, children }: IEimzoProviderProps) {
  const [isInstalled, setIsInstalled] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState<IEimzoVersion | null>(null)
  const [keyList, setKeyList] = useState<ICertificate[]>([])
  const [deviceStatus, setDeviceStatus] = useState<IDeviceStatus>({
    idcard: false,
    baikey: false,
    ckc: false,
  })

  const checkDevices = useCallback(async () => {
    const [idcard, baikey, ckc] = await Promise.allSettled([
      eimzo.checkIdCard(),
      eimzo.checkBaikToken(),
      eimzo.checkCkc(),
    ])
    setDeviceStatus({
      idcard: idcard.status === 'fulfilled' && idcard.value,
      baikey: baikey.status === 'fulfilled' && baikey.value,
      ckc: ckc.status === 'fulfilled' && ckc.value,
    })
  }, [])

  useEffect(() => {
    eimzo
      .install(apiKeys)
      .then(async (v) => {
        setIsInstalled(true)
        setVersion(v)
        setError(null)
        await checkDevices()
      })
      .catch((err) => {
        setIsInstalled(false)
        setError(typeof err === 'string' ? err : String(err))
      })
  }, [])

  const loadKeys = useCallback(async () => {
    setIsLoading(true)
    try {
      const certs = await eimzo.listAllUserKeys()
      setKeyList(certs)
    } catch (err) {
      console.error('E-IMZO: Failed to load keys', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const sign = useCallback(
    async ({ keyId, data, onSuccess, onError }: ISignParams) => {
      setIsLoading(true)
      try {
        let id: string

        if (typeof keyId === 'object') {
          id = await eimzo.loadKey(keyId)
        } else {
          id = keyId
        }

        const pkcs7 = await eimzo.createPkcs7(id, data)
        onSuccess(pkcs7)
      } catch (err) {
        const message = typeof err === 'string' ? err : String(err)
        onError?.(message)
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  return (
    <EimzoContext.Provider
      value={{
        isInstalled,
        isLoading,
        error,
        version,
        keyList,
        deviceStatus,
        loadKeys,
        sign,
      }}
    >
      {children}
    </EimzoContext.Provider>
  )
}

export function useEimzo() {
  const context = useContext(EimzoContext)
  if (!context) {
    throw new Error('useEimzo must be used within EimzoProvider')
  }
  return context
}
