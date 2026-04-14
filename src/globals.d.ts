/* eslint-disable no-var */
declare var CAPIWS: {
  URL: string
  callFunction: (
    funcDef: any,
    callback: (event: any, data: any) => void,
    error: (e: any) => void,
  ) => void
  version: (
    callback: (event: any, data: any) => void,
    error: (e: any) => void,
  ) => void
  apikey: (
    domainAndKey: string[],
    callback: (event: any, data: any) => void,
    error: (e: any) => void,
  ) => void
}

declare var EIMZOClient: {
  NEW_API: boolean
  NEW_API2: boolean
  NEW_API3: boolean
  API_KEYS: string[]
  checkVersion: (
    success: (major: string, minor: string) => void,
    fail: (e: any, r: string | null) => void,
  ) => void
  installApiKeys: (
    success: () => void,
    fail: (e: any, r: string | null) => void,
  ) => void
  listAllUserKeys: (
    itemIdGen: (o: any, i: number) => string,
    itemUiGen: (itemId: string, v: any) => any,
    success: (items: any[], firstId: string | null) => void,
    fail: (e: any, r: string | null) => void,
  ) => void
  idCardIsPLuggedIn: (
    success: (plugged: boolean) => void,
    fail: (e: any, r: string | null) => void,
  ) => void
  isBAIKTokenPLuggedIn: (
    success: (plugged: boolean) => void,
    fail: (e: any, r: string | null) => void,
  ) => void
  isCKCPLuggedIn: (
    success: (plugged: boolean) => void,
    fail: (e: any, r: string | null) => void,
  ) => void
  loadKey: (
    itemObject: any,
    success: (id: string) => void,
    fail: (e: any, r: string | null) => void,
    verifyPassword?: boolean,
  ) => void
  createPkcs7: (
    id: string,
    data: string,
    timestamper: any,
    success: (pkcs7: string) => void,
    fail: (e: any, r: string | null) => void,
    detached?: boolean,
    isDataBase64Encoded?: boolean,
  ) => void
}

declare var Base64: {
  encode: (u: string, urisafe?: boolean) => string
  decode: (a: string) => string
}
