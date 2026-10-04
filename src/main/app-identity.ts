/**
 * 进程级应用身份：显示名（APP_NAME）与数据目录名（DATA_DIR_NAME）必须分开。
 *
 * Electron 的 safeStorage 在 Windows 上用 DPAPI 加密，密文绑定 userData 路径（不是 app 名）：
 * 实测同一密文在改名后仍可解，但只要 userData 目录换了就报 "Error while decrypting"。
 * 后果：目录名跟着显示名走 = 改名一次就把 settings.json 里已存的 API Key 全部作废
 * （SettingsStore 解密失败即视为未配置，老师得重填一次）。
 * 所以：显示名随便改，这个目录名不动 —— 与 Chrome/VS Code 保持稳定 profile 目录同理。
 *
 * 必须在任何 safeStorage 使用之前执行：index.ts 顶层导入时调用一次。
 */
import { app } from 'electron'
import { join } from 'node:path'
import { DATA_DIR_NAME } from '../shared/app-meta'

export function applyAppIdentity(): void {
  app.setPath('userData', join(app.getPath('appData'), DATA_DIR_NAME))
}
