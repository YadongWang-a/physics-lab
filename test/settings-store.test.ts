import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SettingsStore, type SettingsCipher } from '../src/main/workspace/app-settings'
import { mergeSettings, toSlotView, type AppSettings } from '../src/shared/settings-types'

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
      main: { provider: 'deepseek', modelId: 'deepseek-v4-flash', apiKey: 'sk-secret-main' },
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
      vision: { provider: 'deepseek', modelId: 'glm-5.x', apiKey: 'sk-vision' }
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
    store.save({ main: { provider: 'deepseek', modelId: 'deepseek-v4-flash' } })

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
    const view = toSlotView({ provider: 'deepseek', modelId: 'deepseek-v4-flash', apiKey: 'sk-secret' })
    expect(view).not.toHaveProperty('apiKey')
    expect(view?.hasApiKey).toBe(true)
    expect(toSlotView(undefined)).toBeNull()
  })
})
describe('SettingsStore.patch：局部更新不丢字段（openWorkspace 回归）', () => {
  it('仅更新 workspaceDir 时保留已保存的主模型 Key 与视觉槽位', () => {
    const dir = mkdtempSync(join(tmpdir(), 'settings-test-'))
    const store = SettingsStore.at(dir, fakeCipher)
    store.save({
      main: { provider: 'deepseek', modelId: 'deepseek-v4-flash', apiKey: 'sk-secret-main' },
      vision: { provider: 'deepseek', modelId: 'deepseek-v4-flash', apiKey: 'sk-secret-vision' },
      workspaceDir: '/old'
    })
    // openWorkspace 现在走 patch：只更新 workspaceDir
    store.patch({ workspaceDir: join(dir, 'ws') })
    // 已保存的 Key 必须仍在
    expect(store.load().main?.apiKey).toBe('sk-secret-main')
    expect(store.load().vision?.apiKey).toBe('sk-secret-vision')
    expect(store.load().workspaceDir).toBe(join(dir, 'ws'))
  })
})

describe('mergeSettings：settings:save 合并语义（重存设置不丢 Key）', () => {
  it('写入主模型 Key 并保留既有 workspaceDir', () => {
    const current: AppSettings = { workspaceDir: '/old' }
    const merged = mergeSettings(current, {
      main: { provider: 'deepseek', modelId: 'deepseek-v4-flash' },
      mainApiKey: 'sk-new'
    })
    const dir = mkdtempSync(join(tmpdir(), 'settings-test-'))
    const store = SettingsStore.at(dir, fakeCipher)
    store.save(merged)
    expect(store.load().main?.apiKey).toBe('sk-new')
    expect(store.load().workspaceDir).toBe('/old')
    expect(toSlotView(store.load().main)?.hasApiKey).toBe(true)
  })

  it('省略 mainApiKey（留空保持不变）→ 保留既有 Key，不清除', () => {
    const dir = mkdtempSync(join(tmpdir(), 'settings-test-'))
    const store = SettingsStore.at(dir, fakeCipher)
    // 先存一个 Key（模拟用户之前配置）
    store.save({ main: { provider: 'deepseek', modelId: 'deepseek-v4-flash', apiKey: 'sk-existing' } })
    // 重开设置、改了别的字段但没重输 Key：payload.main 不含明文 Key
    const current = store.load()
    const merged = mergeSettings(current, {
      main: { provider: 'deepseek', modelId: 'deepseek-v4-flash' }
    })
    store.save(merged)
    // 既有 Key 必须仍在（此前此场景会清掉 Key → banner 复现）
    expect(store.load().main?.apiKey).toBe('sk-existing')
    expect(toSlotView(store.load().main)?.hasApiKey).toBe(true)
  })

  it('payload.main 整体缺省（只更新 vision）→ 回退 current.main，不丢主模型', () => {
    const dir = mkdtempSync(join(tmpdir(), 'settings-test-'))
    const store = SettingsStore.at(dir, fakeCipher)
    store.save({ main: { provider: 'deepseek', modelId: 'deepseek-v4-flash', apiKey: 'sk-main' } })
    const current = store.load()
    const merged = mergeSettings(current, {
      vision: { provider: 'deepseek', modelId: 'deepseek-v4-flash' },
      visionApiKey: 'sk-vision'
    })
    store.save(merged)
    expect(store.load().main?.apiKey).toBe('sk-main')
    expect(store.load().vision?.apiKey).toBe('sk-vision')
  })
})

describe('SettingsStore：旧配置迁移（opencode-go → deepseek）', () => {
  it('载入时把存量 opencode-go 供应商迁移为 deepseek，Key 保留', () => {
    const dir = mkdtempSync(join(tmpdir(), 'settings-test-'))
    const cipher = fakeCipher
    const legacy = {
      workspaceDir: 'C:/ws',
      main: { provider: 'opencode-go', modelId: 'deepseek-v4-flash', apiKeyEnc: cipher.encrypt('sk-legacy') }
    }
    writeFileSync(join(dir, 'settings.json'), JSON.stringify(legacy), 'utf8')
    const loaded = SettingsStore.at(dir, cipher).load()
    expect(loaded.main?.provider).toBe('deepseek')
    expect(loaded.main?.modelId).toBe('deepseek-v4-flash')
    expect(loaded.main?.apiKey).toBe('sk-legacy')
  })
})
