import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SettingsStore, type SettingsCipher } from '../src/main/workspace/app-settings'
import { toSlotView, type AppSettings } from '../src/shared/settings-types'

/** 确定性 fake：base64 反转（仅测试用；真实路径为 safeStorage/DPAPI） */
const fakeCipher: SettingsCipher = {
  encrypt: (plain) => Buffer.from(plain).toString('base64'),
  decrypt: (enc) => Buffer.from(enc, 'base64').toString('utf8')
}

describe('SettingsStore：双槽位加密存储', () => {
  it('明文 Key 不落盘：盘上只有 apiKeyEnc（加密形态）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'settings-test-'))
    const store = SettingsStore.at(dir, fakeCipher)
    store.save({
      main: { provider: 'opencode-go', modelId: 'deepseek-v4-flash', apiKey: 'sk-secret-main' },
      vision: { provider: 'deepseek', modelId: 'deepseek-v4-flash', apiKey: 'sk-secret-vision' }
    })

    const raw = readFileSync(join(dir, 'settings.json'), 'utf8')
    expect(raw).not.toContain('sk-secret-main')
    expect(raw).not.toContain('sk-secret-vision')
    expect(raw).toContain('apiKeyEnc')
  })

  it('load 还原明文 Key 与非密字段', () => {
    const dir = mkdtempSync(join(tmpdir(), 'settings-test-'))
    const store = SettingsStore.at(dir, fakeCipher)
    store.save({
      main: { provider: 'custom', modelId: 'qwen-max', baseUrl: 'https://proxy.example/v1', api: 'openai-completions', apiKey: 'sk-main' },
      vision: { provider: 'opencode-go', modelId: 'glm-5.x', apiKey: 'sk-vision' }
    })

    const loaded = store.load()
    expect(loaded.main).toMatchObject({
      provider: 'custom',
      modelId: 'qwen-max',
      baseUrl: 'https://proxy.example/v1',
      api: 'openai-completions',
      apiKey: 'sk-main'
    })
    expect(loaded.vision?.apiKey).toBe('sk-vision')
  })

  it('解密失败（换机/密钥轮换）→ Key 视为未配置，其余字段保留', () => {
    const dir = mkdtempSync(join(tmpdir(), 'settings-test-'))
    const store = SettingsStore.at(dir, fakeCipher)
    store.save({ main: { provider: 'deepseek', modelId: 'deepseek-v4-flash', apiKey: 'sk-old' } })

    const broken: SettingsCipher = {
      encrypt: () => '',
      decrypt: () => {
        throw new Error('decrypt failed')
      }
    }
    const loaded = SettingsStore.at(dir, broken).load()
    expect(loaded.main?.provider).toBe('deepseek')
    expect(loaded.main?.apiKey).toBeUndefined()
  })

  it('无 Key 的槽位不写 apiKeyEnc；vision 可整体缺省', () => {
    const dir = mkdtempSync(join(tmpdir(), 'settings-test-'))
    const store = SettingsStore.at(dir, fakeCipher)
    store.save({ main: { provider: 'opencode-go', modelId: 'deepseek-v4-flash' } })

    const raw = readFileSync(join(dir, 'settings.json'), 'utf8')
    expect(raw).not.toContain('apiKeyEnc')
    expect(raw).not.toContain('vision')
    const loaded = store.load()
    expect(loaded.main?.apiKey).toBeUndefined()
    expect(loaded.vision).toBeUndefined()
  })

  it('损坏的 settings.json → 空设置（不抛）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'settings-test-'))
    const path = join(dir, 'settings.json')
    writeFileSync(path, '{not json', 'utf8')
    expect(SettingsStore.at(dir, fakeCipher).load()).toEqual({})
  })

  it('toSlotView 剥离明文 Key（渲染层安全边界回归）', () => {
    const view = toSlotView({ provider: 'opencode-go', modelId: 'deepseek-v4-flash', apiKey: 'sk-secret' })
    expect(view).not.toHaveProperty('apiKey')
    expect(view?.hasApiKey).toBe(true)
    expect(toSlotView(undefined)).toBeNull()
  })
})
