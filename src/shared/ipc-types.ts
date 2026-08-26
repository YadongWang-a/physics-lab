/** 主进程 / preload / 渲染层共享的类型（三端 tsconfig 均 include src/shared） */

export interface DemoMeta {
  /** HTML 文件名（工作目录内相对名） */
  file: string
  /** 中文标题（提取自 physics-demo 注释 / <title>，兜底文件名） */
  title: string
  /** 会话文件名（.pi-sessions/ 内） */
  sessionFile: string
  /** 创建时间（Unix ms） */
  createdAt: number
}

export interface WorkspaceSnapshot {
  dir: string
  demos: DemoMeta[]
}
export interface WorkspaceChangedPayload {
  /** 本次新生成的演示文件名；缺省表示非新建（仅刷新列表，不切换选中） */
  created?: string
}

export interface ChatHistoryEntry {
  role: 'user' | 'assistant'
  text: string
}

/** 聊天图片载荷（base64 数据，无 data: 前缀） */
export interface ImagePayload {
  data: string
  mimeType: string
}

import type { ModelSlotConfig, SaveSettingsPayload, SettingsView } from './settings-types'

/** preload 暴露给渲染层的 API 形状（contextBridge） */
export interface RendererApi {
  ping: () => string
  workspace: {
    /** 弹出目录选择并打开为新工作目录；取消返回 null */
    choose: () => Promise<WorkspaceSnapshot | null>
    /** 返回当前工作目录快照（启动时自动恢复上次目录并扫描） */
    get: () => Promise<WorkspaceSnapshot | null>
    /** 重新扫描工作目录 */
    rescan: () => Promise<WorkspaceSnapshot>
    /** 删除演示（html + 会话文件 + 清单条目）；UI 层负责二次确认 */
    remove: (file: string) => Promise<WorkspaceSnapshot>
  }
  chat: {
    /** 向某演示的 agent 会话发送消息；file 为 null 表示新会话；images 为聊天图片（OCR 路由）；sessionKey 为沿用会话的 key（新会话多轮延续）。返回会话 key */
    send: (file: string | null, text: string, images?: ImagePayload[], sessionKey?: string) => Promise<{ ok: boolean; key: string }>
    /** 停止当前回合 */
    abort: (file: string) => Promise<{ ok: boolean }>
    /** 会话历史摘要（内存或磁盘恢复，切换演示时显示） */
    history: (file: string) => Promise<ChatHistoryEntry[]>
    /** 订阅 agent 事件流；返回取消函数 */
    onEvent: (cb: (payload: { file: string; event: unknown }) => void) => () => void
  }
  preview: {
    /** 订阅演示文件变化（fs.watch 防抖）；返回取消函数 */
    onChanged: (cb: (payload: { file: string }) => void) => () => void
    /** 订阅工作目录清单变化（新演示生成等）；payload.created 为本次新生成的文件名；返回取消函数 */
    onWorkspaceChanged: (cb: (payload: WorkspaceChangedPayload) => void) => () => void
  }
  window: {
    /** 主窗口全屏/退出全屏（演示模式投影用） */
    setFullscreen: (flag: boolean) => Promise<void>
    /** 无框窗口：最小化 / 最大化切换 / 关闭 */
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<void>
    close: () => Promise<void>
  }
  settings: {
    /** 当前设置视图（不含明文 Key） */
    get: () => Promise<SettingsView>
    /** 保存双槽位配置（Key 独立传，空 = 保持原样）；保存后旧会话全部释放 */
    save: (payload: SaveSettingsPayload) => Promise<SettingsView>
    /** 内置供应商模型 id 列表（动态获取） */
    models: (provider: string) => Promise<string[]>
    /** 用给定槽位发一次最小请求验证 Key/端点 */
    test: (slot: ModelSlotConfig) => Promise<{ ok: boolean; error?: string }>
    /** 订阅设置变化（保存成功）；返回取消函数 */
    onChanged: (cb: () => void) => () => void
  }
}
