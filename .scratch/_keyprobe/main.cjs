const { app, safeStorage } = require('electron')
const { readFileSync, writeFileSync } = require('fs')
const { join } = require('path')
app.whenReady().then(() => {
  try {
    const s = JSON.parse(readFileSync(join(app.getPath('userData'), 'settings.json'), 'utf8'))
    writeFileSync(process.env.OUT_V, safeStorage.decryptString(Buffer.from(s.vision.apiKeyEnc, 'base64')), 'utf8')
    console.log('vision key ready')
  } catch (e) { console.log('FAIL ' + e.message) }
  app.exit(0)
})
