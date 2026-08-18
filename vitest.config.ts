import { defineConfig } from 'vitest/config'
import { loadEnvFile } from './src/shared/load-env'

// 加载本地 .env 到 process.env（仅开发便利；CI/生产用真实环境变量）
loadEnvFile()

export default defineConfig({
  test: {
    environment: 'node',
    // DeepSeek 生成耗时，放宽超时
    testTimeout: 180_000,
    hookTimeout: 60_000
  }
})
