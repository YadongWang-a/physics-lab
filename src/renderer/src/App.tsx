import { useCallback, useEffect, useRef, useState } from 'react'
import { Markdown } from './Markdown'
import { SettingsModal } from './SettingsModal'
import { friendlyErrorMessage } from '../../shared/errors'
import type { DemoMeta, ImagePayload, RendererApi, WorkspaceSnapshot } from '../../shared/ipc-types'

declare global {
  interface Window {
    api?: RendererApi
  }
}

interface ChatMessage {
  id: number
  role: 'user' | 'assistant' | 'tool' | 'error'
  text: string
  streaming?: boolean
}

/** webview 元素的可用面（渲染层不引入 Electron 类型） */
interface WebviewElement extends HTMLElement {
  reload(): void
  isLoading(): boolean
}

const styles: Record<string, React.CSSProperties> = {
  layout: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'var(--pl-font-sans)', background: 'var(--pl-background)', color: 'var(--pl-foreground)' },
  // ---- 无框窗口标题栏 ----
  titlebar: { height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px 0 14px', borderBottom: '1px solid var(--pl-border)', background: 'rgba(255,255,255,.72)', backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)', userSelect: 'none' },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  brandLogo: { width: 26, height: 26, borderRadius: 6, background: 'var(--grad-primary)', color: 'var(--pl-primary-foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, boxShadow: '0 2px 8px rgba(37,99,235,.35)' },
  brandName: { fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' },
  titlebarRight: { display: 'flex', alignItems: 'center', gap: 8 },
  iconBtn: { border: 'none', background: 'transparent', color: 'var(--pl-muted-foreground)', cursor: 'pointer', borderRadius: 6, padding: '6px 10px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 },
  iconBtnHover: { background: 'var(--pl-muted)', color: 'var(--pl-foreground)' },
  providerBadge: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 6, background: 'var(--pl-muted)', fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: '50%' },
  winBtn: { width: 36, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--pl-muted-foreground)', cursor: 'pointer', borderRadius: 6 },
  // ---- 浏览窗口（工作空间演示列表，可收缩；标题栏 ☰ 呼出） ----
  browse: { width: 208, minWidth: 208, display: 'flex', flexDirection: 'column', background: 'var(--pl-card)', borderRight: '1px solid var(--pl-border)', flexShrink: 0, transition: 'width 240ms ease, opacity 200ms ease, min-width 240ms ease' },
  browseCollapsed: { width: 0, minWidth: 0, opacity: 0, overflow: 'hidden', borderRight: 'none' },
  browseHead: { height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px 0 14px' },
  browseHeadTitle: { fontSize: 12, fontWeight: 600, flex: 1 },
  browseHeadCount: { fontSize: 11, color: 'var(--pl-muted-foreground)', fontWeight: 400 },
  browseHeadBtn: { width: 24, height: 24, border: 'none', background: 'transparent', color: 'var(--pl-muted-foreground)', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  browseList: { flex: 1, overflowY: 'auto', padding: '2px 8px 12px', display: 'flex', flexDirection: 'column', gap: 2 },
  browseItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', width: '100%', border: '1px solid transparent', background: 'transparent', font: 'inherit', color: 'inherit', textAlign: 'left', borderRadius: 'var(--pl-radius-md)', cursor: 'pointer', userSelect: 'none', position: 'relative', transition: 'all .12s ease' },
  browseItemHover: { background: 'var(--pl-muted)' },
  browseItemActive: { background: 'var(--primary-soft)', borderColor: 'rgba(37,99,235,.2)' },
  browseThumb: { width: 34, height: 26, borderRadius: 5, background: 'var(--pl-card)', border: '1px solid var(--pl-border)', flexShrink: 0, position: 'relative', overflow: 'hidden' },
  browseMeta: { flex: 1, minWidth: 0 },
  browseTitle: { fontSize: 12, color: 'var(--pl-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 },
  browseTitleActive: { color: '#1d4ed8', fontWeight: 500 },
  browseFile: { fontSize: 10, color: 'var(--pl-muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 },
  browseEmpty: { padding: '12px 14px', fontSize: 11, color: 'var(--pl-muted-foreground)', lineHeight: 1.6 },
  browseDelete: { position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, border: 'none', background: 'var(--pl-muted)', color: 'var(--pl-muted-foreground)', borderRadius: 5, fontSize: 10, cursor: 'pointer', lineHeight: 1, display: 'none' },
  browseFoot: { height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderTop: '1px solid var(--pl-border)', background: 'var(--pl-muted)' },
  browseFootIcon: { width: 16, height: 16, color: 'var(--pl-muted-foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  browseFootName: { flex: 1, fontSize: 11, color: 'var(--pl-ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--pl-font-mono)' },
  browseFootClose: { width: 20, height: 20, border: 'none', background: 'transparent', color: 'var(--pl-muted-foreground)', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  welcome: { padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 8 },
  welcomeKicker: { fontSize: 11, color: 'var(--pl-primary)', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase' },
  welcomeTitle: { fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.3, margin: 0 },
  welcomeDesc: { fontSize: 13, color: 'var(--pl-ink-2)', lineHeight: 1.7, margin: 0 },
  welcomeExamples: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 },
  welcomeExampleBtn: { textAlign: 'left', border: '1px solid var(--pl-border)', background: 'var(--pl-card)', color: 'var(--pl-ink-2)', borderRadius: 'var(--pl-radius-md)', padding: '11px 14px', fontSize: 13, cursor: 'pointer', transition: 'all .15s', lineHeight: 1.5 },
  welcomeExampleHover: { borderColor: 'var(--pl-primary)', color: 'var(--pl-foreground)', background: 'var(--primary-soft)', transform: 'translateX(2px)' },
  // ---- 工作台 ----
  workspace: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  chat: { width: 420, minWidth: 320, maxWidth: '50%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--pl-border)', background: 'var(--pl-card)', transition: 'width 240ms ease, opacity 200ms ease, min-width 240ms ease' },
  chatCollapsed: { width: 0, minWidth: 0, opacity: 0, overflow: 'hidden', borderRight: 'none' },
  chatBody: { flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 },
  msgUser: { alignSelf: 'flex-end', textAlign: 'right', background: 'var(--pl-muted)', color: 'var(--pl-ink)', padding: '10px 16px', borderRadius: 'var(--pl-radius-lg) var(--pl-radius-lg) 4px var(--pl-radius-lg)', maxWidth: '88%', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13.5, lineHeight: 1.6, boxShadow: '0 1px 2px rgba(15,23,42,.10)' },
  msgAssistant: { alignSelf: 'flex-start', background: 'transparent', border: 'none', padding: '4px 0', borderRadius: 0, maxWidth: '94%', whiteSpace: 'normal', fontSize: 13.5, lineHeight: 1.75, boxShadow: 'none' },
  msgError: { alignSelf: 'flex-start', maxWidth: '94%', whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.6, color: 'var(--pl-state-error)', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--pl-radius-md)', padding: '10px 12px' },
  inputCard: { margin: '0 16px 12px', background: 'transparent', position: 'relative' },
  chatInput: { width: '100%', resize: 'none', border: '1px solid var(--pl-border)', background: 'var(--pl-background)', outline: 'none', padding: '12px 14px 4px', fontSize: 13.5, lineHeight: 1.6, fontFamily: 'inherit', color: 'var(--pl-foreground)', maxHeight: 128, borderRadius: 'var(--pl-radius-md)' },
  inputFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px 8px' },
  inputHint: { fontSize: 11, color: 'var(--pl-muted-foreground)', paddingLeft: 4 },
  sendBtn: { border: 'none', background: 'var(--grad-primary)', color: 'var(--pl-primary-foreground)', borderRadius: 10, width: 36, height: 34, cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(37,99,235,.3)' },
  sendBtnDisabled: { opacity: 0.45, cursor: 'default' },
  stopBtn: { border: '1px solid var(--pl-border)', background: 'var(--pl-card)', color: 'var(--pl-state-error)', borderRadius: 8, padding: '0 14px', cursor: 'pointer', fontSize: 12.5 },
  chatToggle: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: 'var(--pl-card)', border: '1px solid var(--pl-border)', color: 'var(--pl-muted-foreground)', cursor: 'pointer', fontSize: 11, boxShadow: 'var(--pl-shadow-2)', flexShrink: 0, padding: 0, lineHeight: 1 },
  // ---- 预览 ----
  preview: { flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--pl-background)', minWidth: 320 },
  previewHeader: { height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid var(--pl-border)', fontSize: 13, fontWeight: 600, background: 'rgba(255,255,255,.72)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' },
  previewBody: { flex: 1, position: 'relative' },
  previewEmpty: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'var(--pl-background)', zIndex: 10 },
  previewEmptyIcon: { width: 56, height: 56, borderRadius: '50%', background: 'rgba(37,99,235,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: 'var(--pl-primary)' },
  presentBtn: { border: 'none', background: 'var(--grad-primary)', color: 'var(--pl-primary-foreground)', borderRadius: 6, padding: '4px 14px', fontSize: 12.5, cursor: 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,.3)' },
  refreshBtn: { position: 'absolute', top: 10, right: 10, zIndex: 20, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--pl-card)', border: '1px solid var(--pl-border)', borderRadius: 7, color: 'var(--pl-muted-foreground)', cursor: 'pointer', boxShadow: 'var(--pl-shadow-1)' },
  // ---- 演示模式 ----
  presentStage: { position: 'fixed', inset: 0, zIndex: 50, background: '#000', display: 'flex', flexDirection: 'column' },
  presentHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 13 },
  presentExit: { border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', color: '#fff', borderRadius: 6, padding: '4px 14px', cursor: 'pointer', fontSize: 13 },
  // ---- 其他 ----
  banner: { background: '#fff7e6', borderBottom: '1px solid #ffd591', padding: '8px 14px', fontSize: 12, color: '#874d00', display: 'flex', gap: 10, alignItems: 'center' },
  attachRow: { display: 'flex', gap: 8, padding: '0 16px', flexWrap: 'wrap', marginTop: -4 },
  attachThumb: { position: 'relative', width: 60, height: 60, border: '1px solid var(--pl-border)', borderRadius: 8, overflow: 'hidden' },
  attachImg: { width: '100%', height: '100%', objectFit: 'cover' },
  attachRemove: { position: 'absolute', top: 2, right: 2, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: 10, width: 16, height: 16, fontSize: 10, lineHeight: '14px', cursor: 'pointer', padding: 0 },
  picker: { padding: '16px 26px', fontSize: 14, border: '1px solid var(--pl-border)', borderRadius: 8, background: 'var(--pl-card)', cursor: 'pointer', boxShadow: 'var(--pl-shadow-1)' },
  hint: { fontSize: 12, color: 'var(--pl-muted-foreground)' }
}

/** 把单条 agent 事件应用为消息变更；返回新的消息列表（未变更返回 null） */
function applyChatEvent(prev: ChatMessage[], e: unknown, nextId: () => number): ChatMessage[] | null {
  if (typeof e !== 'object' || e === null) return null
  const ev = e as Record<string, unknown>
  switch (ev.type) {
    case 'message_update': {
      const ae = 'assistantMessageEvent' in ev ? ev.assistantMessageEvent : null
      if (typeof ae !== 'object' || ae === null || !('type' in ae)) return null
      const delta = 'delta' in ae ? ae.delta : undefined
      if (ae.type !== 'text_delta' || typeof delta !== 'string' || !delta) return null
      const last = prev[prev.length - 1]
      if (last && last.role === 'assistant' && last.streaming) {
        const copy = [...prev]
        copy[copy.length - 1] = { ...last, text: last.text + delta }
        return copy
      }
      return [...prev, { id: nextId(), role: 'assistant', text: delta, streaming: true }]
    }
    case 'tool_execution_start': {
      const toolName = 'toolName' in ev && typeof ev.toolName === 'string' ? ev.toolName : '工具'
      return [...prev, { id: nextId(), role: 'tool', text: `⚙ ${toolName}…` }]
    }
    case 'tool_execution_end': {
      const last = prev[prev.length - 1]
      if (last?.role !== 'tool') return null
      const copy = [...prev]
      copy[copy.length - 1] = { ...last, text: `${last.text} 完成` }
      return copy
    }
    case 'chat_error': {
      const message = 'message' in ev && typeof ev.message === 'string' ? ev.message : '未知错误'
      return [...prev, { id: nextId(), role: 'error', text: `出错：${message}` }]
    }
    case 'check_demo_result': {
      const result = 'result' in ev ? ev.result : null
      if (typeof result !== 'object' || result === null) return null
      const ok = 'ok' in result && result.ok === true
      const issues = 'issues' in result && Array.isArray(result.issues) ? result.issues : []
      const detail = issues
        .map((i) => {
          if (typeof i !== 'object' || i === null) return ''
          const code = 'code' in i ? String(i.code) : ''
          const msg = 'message' in i ? String(i.message) : ''
          return `[${code}] ${msg}`
        })
        .filter(Boolean)
        .join('；')
      const text = ok ? '✅ 自检通过' : `❌ 自检未通过：${detail}`
      return [...prev, { id: nextId(), role: 'tool', text }]
    }
    case 'ocr_note': {
      const note = 'text' in ev && typeof ev.text === 'string' ? ev.text : ''
      return note ? [...prev, { id: nextId(), role: 'tool', text: `📷 ${note}` }] : null
    }
    default:
      return null
  }
}

export function App(): React.JSX.Element {
  const [ws, setWs] = useState<WorkspaceSnapshot | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  /** 主模型槽位是否已配置 Key（未配置 → 顶部引导条） */
  const [hasMainKey, setHasMainKey] = useState<boolean | null>(null)
  /** 待发送的聊天图片（粘贴） */
  const [images, setImages] = useState<ImagePayload[]>([])
  /** 演示模式（ticket 07）：全屏展示当前演示 */
  const [presenting, setPresenting] = useState(false)
  /** 聊天面板折叠（参考 physics-lab-main 界面交互） */
  const [chatCollapsed, setChatCollapsed] = useState(false)
  /** 浏览窗口（演示列表）折叠：收起后完全隐藏，标题栏 ☰ 呼出 */
  const [browseCollapsed, setBrowseCollapsed] = useState(false)
  const msgId = useRef(0)
  const webviewRef = useRef<WebviewElement | null>(null)
  // 当前活跃会话 key：选中演示名，或未选中时新会话的 key（chat.send 返回）
  const activeKeyRef = useRef<string | null>(null)
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selected

  const append = useCallback((msg: Omit<ChatMessage, 'id'>) => {
    msgId.current += 1
    setMessages((prev) => [...prev, { ...msg, id: msgId.current }])
  }, [])

  const refresh = useCallback(async () => {
    const next = await window.api?.workspace.rescan()
    if (next) setWs(next)
  }, [])

  useEffect(() => {
    window.api?.workspace.get().then((snap) => {
      setWs(snap)
      if (snap?.demos[0]) setSelected(snap.demos[0].file)
      setLoading(false)
    })

    const offEvent = window.api?.chat.onEvent(({ file, event }) => {
      // 只处理当前活跃会话的事件
      if (file !== activeKeyRef.current && file !== selectedRef.current) return
      // 函数式更新：同一 tick 批量到达的多个事件也基于最新累积；
      // 值更新 + 异步 ref 会让批内只保留最后一个 delta（流式文本大面积丢失）
      setMessages((prev) => {
        const next = applyChatEvent(prev, event, () => {
          msgId.current += 1
          return msgId.current
        })
        return next ?? prev
      })
      const settled =
        typeof event === 'object' && event !== null && (event as { type?: string }).type === 'agent_settled'
      const errored =
        typeof event === 'object' && event !== null && (event as { type?: string }).type === 'chat_error'
      if (settled || errored) {
        setStreaming(false)
        // 清空每条消息的 streaming 标记，助手状态标签由「生成中」切回「推导/修改」
        setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)))
      }
    })
    const offPreview = window.api?.preview.onChanged(({ file }) => {
      if (file === selectedRef.current) {
        setTimeout(() => {
          const wv = webviewRef.current
          if (wv && !wv.isLoading()) wv.reload()
        }, 100)
      }
    })
    const offWorkspace = window.api?.preview.onWorkspaceChanged(() => {
      // 新演示生成：刷新列表，自动选中新条目
      window.api?.workspace.get().then((snap) => {
        if (!snap) return
        setWs(snap)
        if (!selectedRef.current && snap.demos[0]) setSelected(snap.demos[0].file)
        else if (selectedRef.current && !snap.demos.some((d) => d.file === selectedRef.current)) {
          setSelected(snap.demos[0]?.file ?? null)
        }
      })
    })
    const offSettings = window.api?.settings.onChanged(() => {
      window.api?.settings.get().then((v) => setHasMainKey(Boolean(v.main?.hasApiKey)))
    })
    window.api?.settings.get().then((v) => setHasMainKey(Boolean(v.main?.hasApiKey)))
    return () => {
      offEvent?.()
      offPreview?.()
      offWorkspace?.()
      offSettings?.()
    }
  }, [])

  const selectDemo = useCallback(async (file: string) => {
    setSelected(file)
    activeKeyRef.current = null
    setStreaming(false)
    setMessages([])
    msgId.current = 0
    const history = (await window.api?.chat.history(file)) ?? []
    for (const h of history) {
      msgId.current += 1
      setMessages((prev) => [...prev, { id: msgId.current, role: h.role, text: h.text }])
    }
  }, [])

  const onNewTab = useCallback(() => {
    setSelected(null)
    activeKeyRef.current = null
    setStreaming(false)
    setMessages([])
    msgId.current = 0
  }, [])

  const appendImage = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const data = String(reader.result ?? '').replace(/^data:[^;]+;base64,/, '')
      setImages((prev) => [...prev, { data, mimeType: file.type }])
    }
    reader.readAsDataURL(file)
  }, [])

  const send = useCallback(async () => {
    const text = input.trim()
    if ((!text && images.length === 0) || streaming) return
    setInput('')
    const payload = [...images]
    setImages([])
    msgId.current += 1
    setMessages((prev) => [...prev, { id: msgId.current, role: 'user', text: text || '（图片）' }])
    setStreaming(true)
    try {
      const { key } = await window.api!.chat.send(selected, text, payload)
      activeKeyRef.current = key
    } catch (err) {
      append({ role: 'error', text: friendlyErrorMessage(err) })
      setStreaming(false)
    }
  }, [input, selected, streaming, append, images])

  const stop = useCallback(async () => {
    const key = activeKeyRef.current ?? selected
    if (key) await window.api?.chat.abort(key)
  }, [selected])

  const enterPresent = useCallback(() => {
    setPresenting(true)
    window.api?.window.setFullscreen(true)
  }, [])

  const exitPresent = useCallback(() => {
    setPresenting(false)
    window.api?.window.setFullscreen(false)
  }, [])

  // 演示模式 Esc 退出（webview 内聚焦时由 demo 处理，此处覆盖其余焦点场景；退出按钮兜底）
  useEffect(() => {
    if (!presenting) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') exitPresent()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [presenting, exitPresent])

  const removeDemo = useCallback(
    async (demo: DemoMeta) => {
      if (!window.confirm(`确定删除演示「${demo.title}」？\n将同时删除该演示的会话，且无法恢复。`)) return
      const snap = await window.api?.workspace.remove(demo.file)
      if (snap) {
        setWs(snap)
        if (selected === demo.file) setSelected(snap.demos[0]?.file ?? null)
      }
    },
    [selected]
  )

  if (loading) return <div style={{ padding: 24 }}>加载中…</div>

  if (!ws) {
    return (
      <div style={{ ...styles.layout, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ margin: 0 }}>物理演示生成器</h2>
        <p style={styles.hint}>选择工作目录：所有生成的演示与会话都保存在这里，拷贝目录即可带走。</p>
        <button style={styles.picker} onClick={() => window.api?.workspace.choose().then((s) => s && setWs(s))}>
          选择工作目录…
        </button>
      </div>
    )
  }

  const selectedDemo = ws.demos.find((d) => d.file === selected) ?? null
  const canSend = !streaming && (input.trim().length > 0 || images.length > 0)
  const inputPlaceholder = selectedDemo ? '输入物理题或修改要求（可粘贴题目图片）…' : '输入物理题，生成一个新演示（可粘贴题目图片）…'

  return (
    <div style={styles.layout}>
      {/* 标题栏（无框窗口拖拽区） */}
      <header style={styles.titlebar} className="titlebar-drag">
        <div style={styles.brand}>
          <div style={styles.brandLogo}><Icon name="flask" size={15} /></div>
          <span style={styles.brandName}>物理演示生成器</span>
        </div>
        <div style={styles.titlebarRight} className="titlebar-no-drag">
          <button style={styles.iconBtn} className="icon-btn" title="模型设置" onClick={() => setSettingsOpen(true)}>
            <Icon name="settings" size={14} />
          </button>
          <div style={styles.providerBadge}>
            <span style={{ ...styles.dot, background: hasMainKey ? 'var(--pl-state-success)' : 'var(--pl-state-warning)' }} />
            <span>{hasMainKey ? '模型已配置' : '未配置 Key'}</span>
          </div>
          <div style={{ width: 1, height: 18, background: 'var(--pl-border)', margin: '0 4px' }} />
          <button style={styles.winBtn} className="win-btn" title="最小化" onClick={() => window.api?.window.minimize()}>
            ─
          </button>
          <button style={styles.winBtn} className="win-btn" title="最大化" onClick={() => window.api?.window.toggleMaximize()}>
            □
          </button>
          <button style={styles.winBtn} className="win-btn win-close" title="关闭" onClick={() => window.api?.window.close()}>
            <Icon name="close" size={14} />
          </button>
        </div>
      </header>

      {hasMainKey === false && (
        <div style={styles.banner}>
          <span>尚未配置主模型 API Key，无法生成演示。</span>
          <button style={{ ...styles.iconBtn, color: '#874d00', fontWeight: 600 }} className="icon-btn" onClick={() => setSettingsOpen(true)}>
            去设置 →
          </button>
        </div>
      )}

      {/* 会话标签页栏 */}
      {/* 工作台 */}
      <section style={styles.workspace}>
        {/* 常驻窄图标栏（v2 原型 Activity Bar） */}
        {!presenting && (
          <div className="app-rail">
            <button className={'app-rail-btn' + (!browseCollapsed ? ' on' : '')} title="演示列表" onClick={() => setBrowseCollapsed(c => !c)}>
              <Icon name="menu" size={16} />
            </button>
            <button className={'app-rail-btn' + (!chatCollapsed ? ' on' : '')} title="对话" onClick={() => setChatCollapsed(c => !c)}>
              <Icon name="chat" size={16} />
            </button>
          </div>
        )}
        {/* 浏览窗口（工作空间演示列表，可收缩） */}
        {!presenting && !browseCollapsed && (
          <section style={styles.browse}>
            <div style={styles.browseHead}>
              <span style={styles.browseHeadTitle}>演示</span>
              <span style={styles.browseHeadCount}>{ws.demos.length}</span>
              <button style={styles.browseHeadBtn} title="刷新列表" onClick={refresh}>
                <Icon name="refresh" size={13} />
              </button>
              <button style={styles.browseHeadBtn} title="切换工作目录" onClick={() => window.api?.workspace.choose().then((s) => s && setWs(s))}>
                <Icon name="folder" size={14} />
              </button>
              <button style={styles.browseHeadBtn} title="收起浏览" onClick={() => setBrowseCollapsed(true)}>
                <Icon name="close" size={12} />
              </button>
            </div>
            <div style={styles.browseList} className="no-scrollbar">
              {ws.demos.length === 0 && (
                <div style={styles.browseEmpty}>还没有演示 — 在聊天区输入一道物理题开始生成</div>
              )}
              {ws.demos.map((d) => (
                <button
                  key={d.file}
                  type="button"
                  data-demo-item
                  style={selected === d.file ? { ...styles.browseItem, ...styles.browseItemActive } : styles.browseItem}
                  title={d.file}
                  onClick={() => selectDemo(d.file)}
                >
                  <div style={styles.browseThumb} />
                  <div style={styles.browseMeta}>
                    <div style={selected === d.file ? { ...styles.browseTitle, ...styles.browseTitleActive } : styles.browseTitle}>
                      {d.title}
                    </div>
                    <div style={styles.browseFile}>{d.file}</div>
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    style={styles.browseDelete}
                    title="删除演示"
                    aria-label={`删除演示 ${d.title}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      removeDemo(d)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        e.stopPropagation()
                        removeDemo(d)
                      }
                    }}
                  >
                    <Icon name="close" size={11} />
                  </span>
                </button>
              ))}
            </div>
            <div style={styles.browseFoot}>
              <span style={styles.browseFootIcon}><Icon name="folder" size={14} /></span>
              <span style={styles.browseFootName}>{ws.dir.replace(/\\/g, '/').split('/').slice(-2).join('/')}</span>
              <button style={styles.browseFootClose} title="关闭工作空间" onClick={() => setWs(null)}>
                <Icon name="close" size={11} />
              </button>
            </div>
          </section>
        )}

        {!presenting && (
          <section style={chatCollapsed ? { ...styles.chat, ...styles.chatCollapsed } : styles.chat}>
            <div style={{ height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 8px', borderBottom: '1px solid var(--pl-border)', gap: 4 }}>
              <div style={{ flex: 1 }} />
              <button
                style={{ width: 28, height: 28, border: 'none', background: 'transparent', color: 'var(--pl-muted-foreground)', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="收起对话"
                onClick={() => setChatCollapsed(true)}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <div style={styles.chatBody}>
              {messages.length === 0 && (
                <div style={styles.welcome}>
                  <div style={styles.welcomeKicker}>物理演示生成器</div>
                  <h2 style={styles.welcomeTitle}>输入一道物理题，开始生成</h2>
                  <p style={styles.welcomeDesc}>支持文字描述或粘贴题目照片。AI 会按流程推导、生成交互演示并自动自检。</p>
                  <div style={styles.welcomeExamples}>
                    {['一个小球从 5m 高处自由落体，求落地时间', '两个小球弹性碰撞，质量 1:2', '绳环从高处下落（物理过程，无需答案）'].map((ex) => (
                      <button
                        key={ex}
                        style={styles.welcomeExampleBtn}
                        className="icon-btn"
                        onMouseEnter={(e) => Object.assign(e.currentTarget.style, styles.welcomeExampleHover)}
                        onMouseLeave={(e) => Object.assign(e.currentTarget.style, styles.welcomeExampleBtn)}
                        onClick={() => setInput(ex)}
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, idx) => {
                const priorAssistant = messages.slice(0, idx).filter((x) => x.role === 'assistant').length
                const tag = m.role === 'assistant' ? (m.streaming ? '生成中' : priorAssistant > 0 ? '修改' : '推导') : null
                return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  {idx > 0 && (
                    <div style={{ alignSelf: 'center', width: '50%', height: 1, margin: '4px 0', background: 'linear-gradient(to right, transparent, var(--pl-border), transparent)' }} />
                  )}
                  {m.role === 'assistant' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 11, color: 'var(--pl-muted-foreground)' }}>
                      <span style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--grad-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(37,99,235,.3)' }}>
                        <Icon name="flask" size={12} />
                      </span>
                      <span style={{ fontWeight: 600, color: 'var(--pl-ink-2)' }}>物理助手</span>
                      {tag && (
                        <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 999, background: 'var(--pl-muted)', color: 'var(--pl-muted-foreground)' }}>{tag}</span>
                      )}
                    </div>
                  )}
                  <div
                    style={
                      m.role === 'user'
                        ? styles.msgUser
                        : m.role === 'assistant'
                          ? styles.msgAssistant
                          : m.role === 'error'
                            ? styles.msgError
                            : styles.msgTool
                    }
                  >
                    {m.role === 'tool' && m.streaming && <span className="app-tool-spinner" style={{ display: 'inline-block', width: 12, height: 12, marginRight: 8, verticalAlign: '-2px', border: '2px solid var(--pl-border)', borderTopColor: 'var(--pl-primary)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />}
                    {m.role === 'assistant' ? <Markdown text={m.text} /> : m.text}
                  </div>
                </div>
                )
              })}
              {streaming && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--pl-ink-2)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--pl-state-warning)', animation: 'pulse-ring 1.6s ease-out infinite' }} />
                    <span>生成中 · AI 推导物理过程…</span>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: 'var(--pl-muted)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: '40%', borderRadius: 2, background: 'var(--grad-primary)', animation: 'gen-slide 1.2s ease-in-out infinite' }} />
                  </div>
                  <button style={{ alignSelf: 'flex-start', border: '1px solid var(--pl-border)', background: 'var(--pl-card)', color: 'var(--pl-state-error)', borderRadius: 8, padding: '4px 14px', cursor: 'pointer', fontSize: 12.5 }} onClick={stop}>
                    ■ 停止生成
                  </button>
                </div>
              )}
            </div>
            {images.length > 0 && (
              <div style={styles.attachRow}>
                {images.map((img, idx) => (
                  <div key={idx} style={styles.attachThumb}>
                    <img src={`data:${img.mimeType};base64,${img.data}`} alt="" style={styles.attachImg} />
                    <button
                      style={styles.attachRemove}
                      title="移除图片"
                      onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Icon name="close" size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={styles.inputCard}>
              <textarea
                className="app-chat-input"
                style={styles.chatInput}
                rows={2}
                value={input}
                placeholder={inputPlaceholder}
                onChange={(e) => setInput(e.target.value)}
                onPaste={(e) => {
                  const files = Array.from(e.clipboardData.files)
                  for (const f of files) appendImage(f)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (canSend) send()
                  }
                }}
              />
              <div style={styles.inputFooter}>
                <span style={styles.inputHint}>Shift + Enter 换行</span>
                {streaming ? (
                  <button style={styles.stopBtn} onClick={stop}>
                    停止
                  </button>
                ) : (
                  <button
                    style={canSend ? styles.sendBtn : { ...styles.sendBtn, ...styles.sendBtnDisabled }}
                    onClick={send}
                    disabled={!canSend}
                    title="发送"
                  >
                    <Icon name="arrowUp" size={16} />
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {/* 聊天收/展按钮在 previewHeader 内（webview 区域之外，保证可点） */}

        <section style={presenting ? styles.presentStage : styles.preview}>
          {presenting ? (
            <div style={styles.presentHeader}>
              <span>{selectedDemo?.title ?? ''}（演示模式 · 空格暂停/继续，R 重置）</span>
              <button style={styles.presentExit} onClick={exitPresent}>
                退出演示（Esc）
              </button>
            </div>
          ) : (
            <div style={styles.previewHeader}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>{selectedDemo ? selectedDemo.title : '预览'}</span>
                {selectedDemo && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 400, color: 'var(--pl-muted-foreground)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pl-state-success)', boxShadow: '0 0 6px rgba(16,185,129,.6)', animation: 'pulse-dot 2s ease-in-out infinite' }} />
                    实时预览
                  </span>
                )}
              </span>
              {selectedDemo && (
                <button style={styles.presentBtn} onClick={enterPresent}>
                  <Icon name="play" size={12} /> 演示
                </button>
              )}
            </div>
          )}
          <div style={styles.previewBody} className="app-preview-body">
            {streaming && (
              <div className="app-gen-skeleton">
                <div className="blk" /><div className="blk" /><div className="blk" />
              </div>
            )}
            {selectedDemo ? (
              <>
                <button style={styles.refreshBtn} title="刷新预览" onClick={() => webviewRef.current?.reload()}>
                  <Icon name="refresh" size={13} />
                </button>
                <webview
                  ref={(el) => {
                    webviewRef.current = el as WebviewElement | null
                  }}
                  src={'file://' + encodeURI(ws.dir.replace(/\\/g, '/') + '/' + selectedDemo.file)}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  partition="persist:preview"
                />
              </>
            ) : (
              <div style={styles.previewEmpty}>
                <div style={styles.previewEmptyIcon}><Icon name="play" size={24} /></div>
                <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>演示生成后在此加载</p>
                <p style={styles.hint}>输入一道物理题，或从上方标签页选择已有演示</p>
              </div>
            )}
          </div>
        </section>
      </section>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

const ICONS: Record<string, React.ReactNode> = {
  flask: <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" />,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1h.09a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  refresh: <><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>,
  play: <path d="M8 5v14l11-7z" />,
  arrowUp: <><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></>,
  folder: <><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></>,
}
function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  )
}
