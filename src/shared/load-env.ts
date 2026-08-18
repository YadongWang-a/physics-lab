import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 把项目根目录 .env 加载进 process.env（仅当变量未设置时）。
 * 开发便利：vitest 与 Electron dev 共用；生产 Key 来自设置存储（ticket 05）。
 */
export function loadEnvFile(cwd = process.cwd()): void {
  try {
    for (const line of readFileSync(join(cwd, '.env'), 'utf8').split('\n')) {
      // 兼容 CRLF（Windows）：行尾 \r 剔除；值内 =/# 不处理（dev 便利，够用即可）
      const m = line.replace(/\r$/, '').match(/^([A-Z0-9_]+)="?(.*?)"?$/)
      if (m) {
        const [, name, value] = m
        if (name && value !== undefined && !process.env[name]) process.env[name] = value
      }
    }
  } catch {
    /* 无 .env 时静默 */
  }
}
