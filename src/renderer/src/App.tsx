import { useCallback, useEffect, useRef, useState } from 'react'
import type { DemoMeta, RendererApi, WorkspaceSnapshot } from '../../shared/ipc-types'

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
  layout: { display: 'flex', height: '100vh', fontFamily: 'system-ui, "Microsoft YaHei", sans-serif' },
  sidebar: { width: 240, borderRight: '1px solid #e2e5ea', display: 'flex', flexDirection: 'column', background: '#f7f8fa', minWidth: 200 },
  sidebarHeader: { padding: '12px 14px', borderBottom: '1px solid #e2e5ea' },
  dirPath: { fontSize: 11, color: '#6b7280', wordBreak: 'break-all', marginTop: 6 },
  demoList: { flex: 1, overflowY: 'auto', padding: 8 },
  demoItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, cursor: 'pointer', gap: 8 },
  demoItemActive: { background: '#e8edf5' },
  demoTitle: { fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  deleteBtn: { border: 'none', background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: 13 },
  chat: { flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #e2e5ea', minWidth: 320, background: '#fff' },
  chatHeader: { padding: '10px 14px', borderBottom: '1px solid #e2e5ea', fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  chatBody: { flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 },
  msgUser: { alignSelf: 'flex-end', background: '#2f6fd0', color: '#fff', padding: '8px 12px', borderRadius: 10, maxWidth: '85%', whiteSpace: 'pre-wrap', fontSize: 13 },
  msgAssistant: { alignSelf: 'flex-start', background: '#f2f4f7', padding: '8px 12px', borderRadius: 10, maxWidth: '85%', whiteSpace: 'pre-wrap', fontSize: 13 },
  msgTool: { alignSelf: 'flex-start', color: '#6b7280', fontSize: 12, fontFamily: 'Consolas, monospace', whiteSpace: 'pre-wrap' },
  msgError: { alignSelf: 'flex-start', color: '#b42318', fontSize: 12, whiteSpace: 'pre-wrap' },
  chatInputRow: { display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #e2e5ea' },
  chatInput: { flex: 1, resize: 'none', border: '1px solid #c9d2dc', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' },
  sendBtn: { border: 'none', background: '#2f6fd0', color: '#fff', borderRadius: 8, padding: '0 16px', cursor: 'pointer', fontSize: 13 },
  stopBtn: { border: '1px solid #c9d2dc', background: '#fff', color: '#b42318', borderRadius: 8, padding: '0 16px', cursor: 'pointer', fontSize: 13 },
  preview: { flex: 1.2, display: 'flex', flexDirection: 'column', minWidth: 360, background: '#fafbfc' },
  previewHeader: { padding: '10px 14px', borderBottom: '1px solid #e2e5ea', fontSize: 13, fontWeight: 600 },
  previewBody: { flex: 1, position: 'relative' },
  hint: { fontSize: 12, color: '#9ca3af' },
  picker: { padding: '18px 28px', fontSize: 15, border: '1px solid #c9d2dc', borderRadius: 8, background: '#fff', cursor: 'pointer' }
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
      const next = applyChatEvent(messagesRef.current, event, () => {
        msgId.current += 1
        return msgId.current
      })
      if (next) setMessages(next)
      const settled =
        typeof event === 'object' && event !== null && (event as { type?: string }).type === 'agent_settled'
      const errored =
        typeof event === 'object' && event !== null && (event as { type?: string }).type === 'chat_error'
      if (settled || errored) setStreaming(false)
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
    return () => {
      offEvent?.()
      offPreview?.()
      offWorkspace?.()
    }
  }, [])

  // 供事件回调读取最新消息（避免闭包陈旧）
  const messagesRef = useRef<ChatMessage[]>([])
  messagesRef.current = messages

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

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    msgId.current += 1
    setMessages((prev) => [...prev, { id: msgId.current, role: 'user', text }])
    setStreaming(true)
    try {
      const { key } = await window.api!.chat.send(selected, text)
      activeKeyRef.current = key
    } catch (err) {
      append({ role: 'error', text: `发送失败：${err instanceof Error ? err.message : String(err)}` })
      setStreaming(false)
    }
  }, [input, selected, streaming, append])

  const stop = useCallback(async () => {
    const key = activeKeyRef.current ?? selected
    if (key) await window.api?.chat.abort(key)
  }, [selected])

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
  const canSend = !streaming && input.trim().length > 0
  const inputPlaceholder = selectedDemo ? '输入物理题或修改要求…' : '输入物理题，生成一个新演示…'

  return (
    <div style={styles.layout}>
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <strong style={{ fontSize: 13 }}>演示列表</strong>
          <div style={styles.dirPath}>{ws.dir}</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button onClick={() => window.api?.workspace.choose().then((s) => s && setWs(s))} style={{ fontSize: 12, cursor: 'pointer' }}>
              更换目录
            </button>
            <button onClick={refresh} style={{ fontSize: 12, cursor: 'pointer' }}>
              刷新
            </button>
          </div>
        </div>
        <div style={styles.demoList}>
          {ws.demos.length === 0 && <div style={{ padding: 14, fontSize: 12, color: '#9ca3af' }}>还没有演示，在聊天区输入一道物理题开始生成。</div>}
          {ws.demos.map((d) => (
            <div
              key={d.file}
              data-demo-item
              style={selected === d.file ? { ...styles.demoItem, ...styles.demoItemActive } : styles.demoItem}
              title={d.file}
              onClick={() => selectDemo(d.file)}
            >
              <span style={styles.demoTitle}>{d.title}</span>
              <button
                style={styles.deleteBtn}
                onClick={(e) => {
                  e.stopPropagation()
                  removeDemo(d)
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section style={styles.chat}>
        <div style={styles.chatHeader}>
          <span>{selectedDemo ? selectedDemo.title : '新演示'}</span>
          {streaming && (
            <button style={styles.stopBtn} onClick={stop}>
              停止
            </button>
          )}
        </div>
        <div style={styles.chatBody}>
          {messages.length === 0 && (
            <div style={styles.hint}>
              {selectedDemo ? '输入修改要求，或描述新的物理过程。' : '输入一道物理题或物理过程的描述，生成交互式演示。'}
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
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
              {m.text}
            </div>
          ))}
        </div>
        <div style={styles.chatInputRow}>
          <textarea
            style={styles.chatInput}
            rows={2}
            value={input}
            placeholder={inputPlaceholder}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (canSend) send()
              }
            }}
          />
          <button style={styles.sendBtn} onClick={send} disabled={!canSend}>
            发送
          </button>
        </div>
      </section>

      <section style={styles.preview}>
        <div style={styles.previewHeader}>{selectedDemo ? selectedDemo.title : '预览'}</div>
        <div style={styles.previewBody}>
          {selectedDemo ? (
            <webview
              ref={(el) => {
                webviewRef.current = el as WebviewElement | null
              }}
              src={'file://' + encodeURI(ws.dir.replace(/\\/g, '/') + '/' + selectedDemo.file)}
              style={{ width: '100%', height: '100%', border: 'none' }}
              partition="persist:preview"
            />
          ) : (
            <div style={{ padding: 24, color: '#9ca3af' }}>生成演示后在此预览</div>
          )}
        </div>
      </section>
    </div>
  )
}
