# @islom929/react-eimzo

[![npm version](https://img.shields.io/npm/v/@islom929/react-eimzo.svg)](https://www.npmjs.com/package/@islom929/react-eimzo)
[![npm downloads](https://img.shields.io/npm/dm/@islom929/react-eimzo.svg)](https://www.npmjs.com/package/@islom929/react-eimzo)
[![license](https://img.shields.io/npm/l/@islom929/react-eimzo.svg)](https://github.com/islom929/react-eimzo-package/blob/main/LICENSE)

React hook for E-IMZO digital signatures. Simple API, zero UI dependencies — works with any component library.

## Install

```bash
npm install @islom929/react-eimzo
```

No additional setup required. SDK is bundled and auto-injected.

## Quick Start

### 1. Wrap your app with EimzoProvider

```tsx
import { EimzoProvider } from '@islom929/react-eimzo'

function App() {
  return (
    <EimzoProvider
      apiKeys={['yourdomain.uz', 'YOUR_API_KEY_HERE']}
    >
      <YourApp />
    </EimzoProvider>
  )
}
```

Default keys for `localhost` and `127.0.0.1` are always included.

### 2. Use the hook

```tsx
import { useEimzo } from '@islom929/react-eimzo'
import type { ICertificate } from '@islom929/react-eimzo'

function SignDocument() {
  const { sign, loadKeys, keyList, isInstalled, isLoading } = useEimzo()

  const handleSign = (cert: ICertificate) => {
    sign({
      keyId: cert,
      data: JSON.stringify({ document: 'content' }),
      onSuccess: (pkcs7) => {
        console.log('Signed:', pkcs7)
      },
      onError: (err) => {
        console.error('Error:', err)
      },
    })
  }

  return (
    <div>
      <button onClick={loadKeys} disabled={!isInstalled || isLoading}>
        Load keys
      </button>

      {keyList.map((cert) => (
        <button key={cert.serialNumber} onClick={() => handleSign(cert)}>
          {cert.CN}
        </button>
      ))}
    </div>
  )
}
```

## Usage Examples

### Sign with PFX certificate

User selects a certificate from the list. E-IMZO app prompts for password.

```tsx
import { useEimzo } from '@islom929/react-eimzo'
import type { ICertificate } from '@islom929/react-eimzo'

function PfxSign() {
  const { sign, loadKeys, keyList, isInstalled, isLoading } = useEimzo()
  const [result, setResult] = useState('')

  useEffect(() => {
    if (isInstalled) loadKeys()
  }, [isInstalled])

  const handleSign = (cert: ICertificate) => {
    sign({
      keyId: cert,
      data: JSON.stringify({ orderId: 123, amount: 50000 }),
      onSuccess: (pkcs7) => {
        setResult(pkcs7)
        // Send to backend
        fetch('/api/verify', {
          method: 'POST',
          body: JSON.stringify({ pkcs7 }),
        })
      },
      onError: (err) => {
        alert(err) // "Ввод пароля отменен" if user cancels
      },
    })
  }

  return (
    <div>
      <h3>Select certificate:</h3>
      {keyList.map((cert, i) => (
        <div key={`${cert.serialNumber}-${i}`}>
          <p>{cert.CN} — {cert.O}</p>
          <p>PINFL: {cert.PINFL} | STIR: {cert.TIN}</p>
          <p>Valid until: {new Date(cert.validTo).toLocaleDateString()}</p>
          <button
            onClick={() => handleSign(cert)}
            disabled={cert.expired || isLoading}
          >
            {cert.expired ? 'Expired' : 'Sign'}
          </button>
        </div>
      ))}
    </div>
  )
}
```

### Sign with tokens

No certificate selection needed. Pass device type directly. Device status is checked automatically on mount.

```tsx
function TokenSign() {
  const { sign, deviceStatus, isLoading } = useEimzo()

  const handleTokenSign = (device: 'idcard' | 'baikey' | 'ckc') => {
    sign({
      keyId: device,
      data: JSON.stringify({ document: 'content' }),
      onSuccess: (pkcs7) => console.log('Signed:', pkcs7),
      onError: (err) => console.error(err),
    })
  }

  return (
    <div>
      <button
        onClick={() => handleTokenSign('idcard')}
        disabled={!deviceStatus.idcard || isLoading}
      >
        ID Card {deviceStatus.idcard ? '(connected)' : '(not connected)'}
      </button>

      <button
        onClick={() => handleTokenSign('baikey')}
        disabled={!deviceStatus.baikey || isLoading}
      >
        BAIK Token {deviceStatus.baikey ? '(connected)' : '(not connected)'}
      </button>

      <button
        onClick={() => handleTokenSign('ckc')}
        disabled={!deviceStatus.ckc || isLoading}
      >
        CKC {deviceStatus.ckc ? '(connected)' : '(not connected)'}
      </button>
    </div>
  )
}
```

### Error handling

```tsx
function EimzoStatus() {
  const { isInstalled, error, version } = useEimzo()

  if (error) {
    return (
      <div>
        <p style={{ color: 'red' }}>{error}</p>
        <a href="https://e-imzo.uz/main/downloads/">Download E-IMZO</a>
      </div>
    )
  }

  if (!isInstalled) {
    return <p>Loading...</p>
  }

  return <p>E-IMZO v{version?.major}.{version?.minor} ready</p>
}
```

### Error handling in sign

Errors from E-IMZO SDK are passed directly to `onError`. Common errors:

```tsx
sign({
  keyId: cert,
  data: '...',
  onSuccess: (pkcs7) => { /* success */ },
  onError: (err) => {
    // err contains the SDK error message:
    // "Ввод пароля отменен" — user cancelled password dialog
    // "BadPaddingException" — wrong password
    // Other SDK-native errors
    console.error(err)
  },
})
```

### Possible errors

| When | Error | Description |
|------|-------|-------------|
| Install | `"E-IMZO не запущен. Убедитесь, что приложение E-IMZO установлено и запущено."` | E-IMZO app is not running or not installed |
| Install | `"Версия E-IMZO устарела (X.XX). Минимальная версия: 3.36"` | E-IMZO version is too old |
| loadKeys | `"Please install new version of E-IMZO"` | SDK version check failed |
| sign | `"Ввод пароля отменен"` | User cancelled password dialog |
| sign | `"BadPaddingException"` | Wrong password entered |
| sign | WebSocket error code (number) | Connection to E-IMZO lost |

### Version check

The package automatically checks E-IMZO version on mount. Minimum required version is **3.36**.

```tsx
function VersionInfo() {
  const { version, isInstalled } = useEimzo()

  if (!isInstalled || !version) return null

  const v = parseInt(version.major) * 100 + parseInt(version.minor)

  return (
    <div>
      <p>E-IMZO v{version.major}.{version.minor}</p>
      <p>PFX: supported</p>
      <p>ID-card: {v >= 412 ? 'supported' : 'not supported (need v4.12+)'}</p>
      <p>BAIK/CKC: {v >= 486 ? 'supported' : 'not supported (need v4.86+)'}</p>
    </div>
  )
}
```

E-IMZO version determines which key types are available:

| Version | PFX | ID-card | BAIK | CKC |
|---------|-----|---------|------|-----|
| v3.36+ | yes | no | no | no |
| v4.12+ | yes | yes | no | no |
| v4.86+ | yes | yes | yes | yes |

## API

### EimzoProvider

Wraps your app. Initializes E-IMZO SDK automatically.

| Prop | Type | Description |
|------|------|-------------|
| `apiKeys` | `string[]` | Optional. Additional domain + API key pairs |
| `children` | `ReactNode` | Required |

### useEimzo()

| Property | Type | Description |
|----------|------|-------------|
| `isInstalled` | `boolean` | E-IMZO app detected and running |
| `isLoading` | `boolean` | Operation in progress (loadKeys or sign) |
| `error` | `string \| null` | Install error message, null if OK |
| `version` | `IEimzoVersion \| null` | E-IMZO version `{ major, minor }` |
| `keyList` | `ICertificate[]` | Available certificates |
| `deviceStatus` | `IDeviceStatus` | Connected hardware devices |
| `loadKeys` | `() => Promise<void>` | Load certificates and check devices |
| `sign` | `(params: ISignParams) => void` | Sign data |

### sign(params)

| Param | Type | Description |
|-------|------|-------------|
| `keyId` | `ICertificate \| string` | Certificate object or `'idcard'` / `'baikey'` / `'ckc'` |
| `data` | `string` | Data to sign (usually JSON.stringify) |
| `onSuccess` | `(pkcs7: string) => void` | Called with base64 PKCS#7 signature |
| `onError` | `(error: string) => void` | Optional. Called on failure |

## Types

```tsx
import type {
  ICertificate,
  ISignParams,
  IDeviceStatus,
  IEimzoContext,
  IEimzoProviderProps,
  IEimzoVersion,
  TKeyType,
} from '@islom929/react-eimzo'
```

### IEimzoVersion

| Field | Type | Description |
|-------|------|-------------|
| `major` | `string` | Major version (e.g. `"4"`) |
| `minor` | `string` | Minor version (e.g. `"86"`) |

### ICertificate

| Field | Type | Description |
|-------|------|-------------|
| `CN` | `string` | Full name |
| `PINFL` | `string` | Personal ID number |
| `TIN` | `string` | Tax ID (STIR) |
| `O` | `string` | Organization |
| `T` | `string` | Title/Position |
| `UID` | `string` | User ID |
| `serialNumber` | `string` | Certificate serial number |
| `validFrom` | `Date` | Start of validity |
| `validTo` | `Date` | End of validity |
| `type` | `'pfx' \| 'ftjc'` | Certificate type |
| `expired` | `boolean` | Whether certificate has expired |

### IDeviceStatus

| Field | Type | Description |
|-------|------|-------------|
| `idcard` | `boolean` | ID card / EIMZO-Token connected |
| `baikey` | `boolean` | BAIK-Token connected |
| `ckc` | `boolean` | CKC device connected |

## Supported Key Types

| Type | Description | E-IMZO Version |
|------|-------------|----------------|
| PFX | Local certificate file (ERI) | v3.36+ |
| ID-card / EIMZO-Token | Physical smart card | v4.12+ |
| BAIK-Token | BAIK hardware token | v4.86+ |
| CKC | CryptKeyContainer (universal) | v4.86+ |

## How It Works

```
Your React App
    ↓ useEimzo()
@islom929/react-eimzo
    ↓ WebSocket (wss://127.0.0.1:64443)
E-IMZO Desktop App
    ↓
PFX files / USB tokens / ID cards
```

1. Package injects E-IMZO SDK into the page automatically
2. SDK connects to E-IMZO desktop app via WebSocket
3. `loadKeys()` fetches available certificates
4. `sign()` sends data to E-IMZO app for signing
5. E-IMZO app prompts user for password/PIN
6. Signed PKCS#7 (base64) returned via `onSuccess`

## Requirements

- React 18+
- [E-IMZO desktop application](https://e-imzo.uz/main/downloads/) installed on user's computer

## License

MIT
