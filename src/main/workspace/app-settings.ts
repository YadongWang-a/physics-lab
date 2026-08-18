import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 应用设置（userData/settings.json）：当前只记录上次的工作目录 */
export interface AppSettings {
  workspaceDir?: string
}

export class SettingsStore {
  constructor(private readonly settingsPath: string) {}

  static at(userDataDir: string): SettingsStore {
    return new SettingsStore(join(userDataDir, 'settings.json'))
  }

  load(): AppSettings {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.settingsPath, 'utf8'))
      if (typeof parsed === 'object' && parsed !== null) return parsed as AppSettings
    } catch {
      /* 缺失/损坏 → 空设置 */
    }
    return {}
  }

  save(settings: AppSettings): void {
    writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2), 'utf8')
  }
}
