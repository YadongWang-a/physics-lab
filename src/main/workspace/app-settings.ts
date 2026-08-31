import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import type { AppSettings, ModelSlotConfig } from '../../shared/settings-types'

/** 加解密依赖（默认 safeStorage/DPAPI；测试注入 fake） */
export interface SettingsCipher {
  encrypt(plain: string): string
  decrypt(encrypted: string): string
}

/** Windows DPAPI（safeStorage）：明文 Key 只经此加密后落盘 */
export function safeStorageCipher(): SettingsCipher {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统加密不可用（safeStorage）：无法安全保存 API Key')
  }
  return {
    encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
    decrypt: (enc) => safeStorage.decryptString(Buffer.from(enc, 'base64'))
  }
}

/** 持久化形态：Key 经加密为 apiKeyEnc，明文不落盘 */
interface PersistedSlot extends Omit<ModelSlotConfig, 'apiKey'> {
  apiKeyEnc?: string
}
interface PersistedSettings {
  workspaceDir?: string
  main?: PersistedSlot
  vision?: PersistedSlot
}

export class SettingsStore {
  constructor(
    private readonly settingsPath: string,
    private readonly cipher: SettingsCipher
  ) {}

  static at(userDataDir: string, cipher: SettingsCipher = safeStorageCipher()): SettingsStore {
    return new SettingsStore(join(userDataDir, 'settings.json'), cipher)
  }

  load(): AppSettings {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.settingsPath, 'utf8'))
      if (typeof parsed === 'object' && parsed !== null) {
        return decodeSettings(parsed as PersistedSettings, this.cipher)
      }
    } catch {
      /* 缺失/损坏 → 空设置 */
    }
    return {}
  }

  save(settings: AppSettings): void {
    writeFileSync(this.settingsPath, JSON.stringify(encodeSettings(settings, this.cipher), null, 2), 'utf8')
  }

  /** 局部更新：保留既有字段（含已加密的 apiKeyEnc），只覆盖传入的部分 */
  patch(partial: Partial<AppSettings>): void {
    this.save({ ...this.load(), ...partial })
  }
}

function decodeSlot(persisted: PersistedSlot | undefined, cipher: SettingsCipher): ModelSlotConfig | undefined {
  if (!persisted) return undefined
  const { apiKeyEnc, ...rest } = persisted
  const slot: ModelSlotConfig = { ...rest }
  if (apiKeyEnc) {
    try {
      slot.apiKey = cipher.decrypt(apiKeyEnc)
    } catch {
      /* 解密失败（换机/密钥轮换）→ Key 视为未配置 */
    }
  }
  return slot
}

function encodeSlot(slot: ModelSlotConfig | undefined, cipher: SettingsCipher): PersistedSlot | undefined {
  if (!slot) return undefined
  const { apiKey, ...rest } = slot
  const persisted: PersistedSlot = { ...rest }
  if (apiKey) persisted.apiKeyEnc = cipher.encrypt(apiKey)
  return persisted
}

/** 旧版本曾预置 opencode 网关供应商；已移除支持，载入时迁移为 DeepSeek 直连 */
function migrateSlot(slot: ModelSlotConfig | undefined): ModelSlotConfig | undefined {
  if (!slot) return undefined
  // String() 阻断字面量收窄：存量 settings.json 可能仍含已移除的 'opencode-go'
  const legacy = String(slot.provider) === 'opencode-go'
  return legacy ? { ...slot, provider: 'deepseek' } : slot
}

function decodeSettings(persisted: PersistedSettings, cipher: SettingsCipher): AppSettings {
  return {
    workspaceDir: persisted.workspaceDir,
    main: migrateSlot(decodeSlot(persisted.main, cipher)),
    vision: migrateSlot(decodeSlot(persisted.vision, cipher))
  }
}

function encodeSettings(settings: AppSettings, cipher: SettingsCipher): PersistedSettings {
  return {
    workspaceDir: settings.workspaceDir,
    main: encodeSlot(settings.main, cipher),
    vision: encodeSlot(settings.vision, cipher)
  }
}
