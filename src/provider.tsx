import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react'
import type {
  ICertificate,
  IDeviceStatus,
  IEimzoContext,
  IEimzoProviderProps,
  IEimzoVersion,
  ILoadKeysOptions,
  ISignAsyncParams,
  ISignParams,
} from './types'
import * as eimzo from './eimzo'

const EimzoContext = createContext<IEimzoContext | null>(null)

const toErrorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : String(error)

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
  const apiKeysRef = useRef(apiKeys)
  const activeOperationsRef = useRef(0)
  const installPromiseRef = useRef<Promise<IEimzoVersion> | null>(null)
  const keysLoadedRef = useRef(false)
  const keysIncludeLegacyTokensRef = useRef(false)
  const loadKeysPromiseRef = useRef<Promise<void> | null>(null)
  const loadKeysPromiseIncludesLegacyTokensRef = useRef(false)

  const startOperation = useCallback(() => {
    activeOperationsRef.current += 1
    setIsLoading(true)
  }, [])

  const finishOperation = useCallback(() => {
    activeOperationsRef.current = Math.max(0, activeOperationsRef.current - 1)
    if (activeOperationsRef.current === 0) {
      setIsLoading(false)
    }
  }, [])

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

  const ensureInstalled = useCallback((): Promise<IEimzoVersion> => {
    if (installPromiseRef.current) return installPromiseRef.current

    const promise = eimzo
      .install(apiKeysRef.current)
      .then(async (v) => {
        setIsInstalled(true)
        setVersion(v)
        setError(null)
        void checkDevices()
        return v
      })
      .catch((err) => {
        installPromiseRef.current = null
        setIsInstalled(false)
        setError(toErrorMessage(err))
        throw err
      })

    installPromiseRef.current = promise
    return promise
  }, [checkDevices])

  useEffect(() => {
    void ensureInstalled().catch(() => undefined)
  }, [ensureInstalled])

  const runLoadKeys: (
    options?: ILoadKeysOptions,
  ) => Promise<void> = useCallback(
    (options: ILoadKeysOptions = {}): Promise<void> => {
      if (loadKeysPromiseRef.current) {
        const inFlight = loadKeysPromiseRef.current
        const needsLegacyTokenRefresh =
          options.includeLegacyTokens === true &&
          !loadKeysPromiseIncludesLegacyTokensRef.current

        return options.force || needsLegacyTokenRefresh
          ? inFlight.then(() => runLoadKeys(options))
          : inFlight
      }

      const hasRequestedKeys =
        keysLoadedRef.current &&
        (options.includeLegacyTokens !== true ||
          keysIncludeLegacyTokensRef.current)
      if (!options.force && hasRequestedKeys) return Promise.resolve()

      const promise = (async () => {
        startOperation()
        try {
          await ensureInstalled()
          const certs = await eimzo.listAllUserKeys({
            includeLegacyTokens: options.includeLegacyTokens,
          })
          setKeyList(certs)
          setError(null)
          keysLoadedRef.current = true
          keysIncludeLegacyTokensRef.current =
            options.includeLegacyTokens === true
        } catch (err) {
          setError(toErrorMessage(err))
          throw err
        } finally {
          finishOperation()
          loadKeysPromiseRef.current = null
          loadKeysPromiseIncludesLegacyTokensRef.current = false
        }
      })()

      loadKeysPromiseRef.current = promise
      loadKeysPromiseIncludesLegacyTokensRef.current =
        options.includeLegacyTokens === true
      return promise
    },
    [ensureInstalled, finishOperation, startOperation],
  )

  const loadKeys = useCallback(
    (options: ILoadKeysOptions = {}): Promise<void> =>
      runLoadKeys(options).catch(() => undefined),
    [runLoadKeys],
  )

  const reloadKeys = useCallback(
    (options: ILoadKeysOptions = {}) =>
      runLoadKeys({ ...options, force: true }),
    [runLoadKeys],
  )

  const prepareKey = useCallback(
    async (
      certificate: ICertificate,
      verifyPassword = false,
    ): Promise<string> => {
      startOperation()
      try {
        await ensureInstalled()
        const keyId = await eimzo.loadKey(certificate, verifyPassword)
        setError(null)
        return keyId
      } catch (err) {
        const message = toErrorMessage(err)
        setError(message)
        throw err instanceof Error ? err : new Error(message)
      } finally {
        finishOperation()
      }
    },
    [ensureInstalled, finishOperation, startOperation],
  )

  const signAsync = useCallback(
    async ({
      keyId,
      data,
      verifyPassword = false,
    }: ISignAsyncParams): Promise<string> => {
      startOperation()
      try {
        await ensureInstalled()

        const id =
          typeof keyId === 'object'
            ? await eimzo.loadKey(keyId, verifyPassword)
            : keyId

        const signature = await eimzo.createPkcs7(id, data)
        setError(null)
        return signature
      } catch (err) {
        const message = toErrorMessage(err)
        setError(message)
        throw err instanceof Error ? err : new Error(message)
      } finally {
        finishOperation()
      }
    },
    [ensureInstalled, finishOperation, startOperation],
  )

  const sign = useCallback(
    ({ onSuccess, onError, ...params }: ISignParams) =>
      signAsync(params)
        .then(onSuccess)
        .catch((err) => onError?.(toErrorMessage(err))),
    [signAsync],
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
        reloadKeys,
        prepareKey,
        signAsync,
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
