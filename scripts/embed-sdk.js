import { readFileSync, writeFileSync } from 'fs'

const sdk = readFileSync('src/e-imzo.js', 'utf-8')
const escaped = JSON.stringify(sdk)

writeFileSync(
  'src/sdk-content.ts',
  `export const SDK_SOURCE = ${escaped}\n`,
)

console.log('SDK embedded into sdk-content.ts')
