import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import {
  createAgentSession,
  DefaultResourceLoader,
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
  /** 目标会话文件名（.pi-sessions/ 内）；缺省时用 Pi 默认命名（时间戳_uuid） */
  sessionFile?: string
  /** physics-lab-skill 目录（含 SKILL.md）；注册为只读技能（ADR-0003，不修改 skill） */
  skillDir?: string
  /** 追加到系统提示的固定指令（skill 默认常驻触发） */
  systemPrompt?: string
}

/**
 * skill 默认常驻的系统提示（ADR-0003：直接调用现有 skill，不设"引入"概念）。
 * 注意：lib/ 由应用预置到工作目录（避免 agent 读取 mathjax.js 2.1MB 进上下文）。
 */
export const SKILL_SYSTEM_PROMPT = `你是「物理演示生成助手」，为中学物理老师生成课堂演示 HTML。
当用户输入物理题目或物理过程的文字（可附图片、答案）时，你必须用 read 工具读取技能 physics-lab-skill 的 SKILL.md，并严格遵循其中的完整流程：
① 判定输入类型（题目/物理过程；非物理内容直接拒绝并说明）→ ② 澄清几何（位置/初始状态含糊时一次一问）→ ③ 推导与答案确认（是题且无答案时先索要答案/解析；推导过程分阶段输出给用户核对）→ ④ 命名（kebab 英文）→ ⑤ lib：工作目录的 lib/ 已由应用预置且为最新版，确认存在即可，不要读取 mathjax.js 等大文件内容 → ⑥ 从模板填空生成 HTML 写入当前工作目录（只填 @slot，不重写骨架）→ ⑦ 自检（结构/语法/物理/视觉核对，失败修复后重跑）。
不要跳过任何步骤。`

export const DEFAULT_MODEL = 'deepseek-v4-flash'
export const DEFAULT_PROVIDER = 'deepseek'

export interface PhysicsSession {
  session: AgentSession
  /** 已注册技能名（验证 skill 发现） */
  skills: string[]
  /** 实际注入的系统提示（验证 skill 常驻触发） */
  systemPrompt?: string
  /** 释放会话（停止 agent、清理订阅） */
  dispose(): void
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

export async function createPhysicsSession(options: PhysicsAgentOptions): Promise<PhysicsSession> {
  const {
    cwd,
    sessionDir,
    agentDir,
    apiKey,
    modelId = DEFAULT_MODEL,
    sessionManager,
    skillDir,
    systemPrompt
  } = options
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

  // 只读注册 skill（ADR-0003：不修改 skill 内容）+ 系统提示常驻触发
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    additionalSkillPaths: skillDir ? [skillDir] : undefined,
    systemPromptOverride: (base) => (systemPrompt ? `${base ?? ''}\n\n${systemPrompt}` : base)
  })
  await resourceLoader.reload()
  const skills = resourceLoader.getSkills().skills.map((s) => s.name)

  // 会话文件选择：注入的 manager 优先（恢复既有会话）；否则按约定命名（<stem>.jsonl）；最后 Pi 默认
  const manager =
    sessionManager ??
    (options.sessionFile
      ? SessionManager.open(join(sessionDir, options.sessionFile), sessionDir, cwd)
      : SessionManager.create(cwd, sessionDir))
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    model,
    modelRuntime,
    resourceLoader,
    sessionManager: manager,
    // ADR-0003 工具面：内建子集，禁 bash；check_demo 由后续 ticket 以唯一自定义工具加入
    tools: ['read', 'write', 'edit', 'grep', 'find', 'ls']
  })

  return {
    session,
    skills,
    systemPrompt: resourceLoader.getSystemPrompt(),
    dispose: () => session.dispose()
  }
}
