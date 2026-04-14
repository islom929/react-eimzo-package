export type TKeyType = 'pfx' | 'ftjc' | 'idcard' | 'baikey' | 'ckc'

export interface ICertificate {
  disk: string
  path: string
  name: string
  alias: string
  serialNumber: string
  validFrom: Date
  validTo: Date
  CN: string
  TIN: string
  UID: string
  PINFL: string
  O: string
  T: string
  type: TKeyType
  cardUID?: string
  statusInfo?: string
  ownerName?: string
  info?: string
  expired?: boolean
}

export interface ISignParams {
  keyId: ICertificate | string
  data: string
  onSuccess: (pkcs7: string) => void
  onError?: (error: string) => void
}

export interface IDeviceStatus {
  idcard: boolean
  baikey: boolean
  ckc: boolean
}

export interface IEimzoProviderProps {
  apiKeys?: string[]
  children: React.ReactNode
}

export interface IEimzoContext {
  isInstalled: boolean
  isLoading: boolean
  keyList: ICertificate[]
  deviceStatus: IDeviceStatus
  loadKeys: () => Promise<void>
  sign: (params: ISignParams) => void
}
