import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import {
  createAgentSession,
  ModelRegistry,
  ModelRuntime,
  SessionManager,
  type AgentSession
} from '@earendil-works/pi-coding-agent'

/**
 * SDK 层 seam：主进程与 Pi agent 的唯一集成点（ticket 01 最小版）。
 * 测试只在这一层进行（spec「Testing Decisions」）。
 *
 * 应用私有目录约定（spec「密钥存储」）：
 * - agentDir  : 应用私有 agent 配置目录（settings/auth 等），不写全局 ~/.pi
 * - sessionDir: 工作目录下的 .pi-sessions/（ADR-0002：会话随工作目录迁移）
 * - cwd       : 演示文档所在工作目录
 */

export interface PhysicsAgentOptions {
  /** 演示文档所在的工作目录（= skill 生成 HTML 的 cwd） */
  cwd: string
  /** 会话文件目录（工作目录内 .pi-sessions/） */
  sessionDir: string
  /** 应用私有 agent 配置目录 */
  agentDir: string
  /** DeepSeek API Key；缺省时回落到环境变量 DEEPSEEK_API_KEY */
  apiKey?: string
  /** 模型 id，默认 deepseek-v4-flash */
  modelId?: string
  /** 恢复既有会话时传入已打开的 SessionManager；缺省则新建 */
  sessionManager?: SessionManager
}

export const DEFAULT_MODEL = 'deepseek-v4-flash'
export const DEFAULT_PROVIDER = 'deepseek'

export interface PhysicsSession {
  session: AgentSession
  /** 释放会话（停止 agent、清理订阅） */
  dispose(): void
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

export async function createPhysicsSession(options: PhysicsAgentOptions): Promise<PhysicsSession> {
  const { cwd, sessionDir, agentDir, apiKey, modelId = DEFAULT_MODEL, sessionManager } = options
  ensureDir(sessionDir)
  ensureDir(agentDir)

  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, 'auth.json')
  })
  const key = apiKey ?? process.env.DEEPSEEK_API_KEY
  if (key) {
    await modelRuntime.setRuntimeApiKey(DEFAULT_PROVIDER, key)
  }

  const registry = new ModelRegistry(modelRuntime)
  await registry.refresh()
  const model = registry.find(DEFAULT_PROVIDER, modelId)
  if (!model) {
    throw new Error(`模型不存在: ${DEFAULT_PROVIDER}/${modelId}`)
  }
  const manager = sessionManager ?? SessionManager.create(cwd, sessionDir)
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    model,
    modelRuntime,
    sessionManager: manager,
    // ADR-0003 工具面：内建子集，禁 bash；check_demo 由后续 ticket 以唯一自定义工具加入
    tools: ['read', 'write', 'edit', 'grep', 'find', 'ls']
  })

  return {
    session,
    dispose: () => session.dispose()
  }
}
