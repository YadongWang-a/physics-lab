import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { UiPrefs } from '../../shared/ipc-types'

/** 渲染层 UI 偏好存储（与模型/密钥设置分离，纯非敏感项，独立 JSON 落盘） */
export class UiPrefsStore {
  constructor(private readonly path: string) {}

  static at(userDataDir: string): UiPrefsStore {
    return new UiPrefsStore(join(userDataDir, 'ui-prefs.json'))
  }

  load(): UiPrefs {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.path, 'utf8'))
      if (typeof parsed === 'object' && parsed !== null) return parsed as UiPrefs
    } catch {
      /* 缺失/损坏 → 空偏好 */
    }
    return {}
  }

  save(prefs: UiPrefs): void {
    writeFileSync(this.path, JSON.stringify(prefs, null, 2), 'utf8')
  }
}
