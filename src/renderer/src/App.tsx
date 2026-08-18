import { useCallback, useEffect, useState } from 'react'
import type { DemoMeta, WorkspaceSnapshot } from '../../shared/ipc-types'

declare global {
  interface Window {
    api?: import('../../shared/ipc-types').RendererApi
  }
}

/** 渲染层全局样式（简版，不引 UI 框架） */
const styles: Record<string, React.CSSProperties> = {
  layout: { display: 'flex', height: '100vh', fontFamily: 'system-ui, "Microsoft YaHei", sans-serif' },
  sidebar: {
    width: 260,
    borderRight: '1px solid #e2e5ea',
    display: 'flex',
    flexDirection: 'column',
    background: '#f7f8fa'
  },
  sidebarHeader: { padding: '12px 14px', borderBottom: '1px solid #e2e5ea' },
  dirPath: { fontSize: 12, color: '#6b7280', wordBreak: 'break-all', marginTop: 6 },
  demoList: { flex: 1, overflowY: 'auto', padding: 8 },
  demoItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px',
    borderRadius: 6,
    cursor: 'pointer',
    gap: 8
  },
  demoTitle: { fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  deleteBtn: { border: 'none', background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: 13 },
  main: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', flexDirection: 'column', gap: 12 },
  picker: {
    padding: '18px 28px',
    fontSize: 15,
    border: '1px solid #c9d2dc',
    borderRadius: 8,
    background: '#fff',
    cursor: 'pointer'
  },
  hint: { fontSize: 12, color: '#9ca3af' }
}

function DemoList({ demos, onDelete }: { demos: DemoMeta[]; onDelete: (d: DemoMeta) => void }): React.JSX.Element {
  if (demos.length === 0) {
    return <div style={{ padding: 14, fontSize: 12, color: '#9ca3af' }}>还没有演示。生成功能即将上线（ticket 03）。</div>
  }
  return (
    <>
      {demos.map((d) => (
        <div key={d.file} style={styles.demoItem} title={d.file} data-demo-item>
          <span style={styles.demoTitle}>{d.title}</span>
          <button
            style={styles.deleteBtn}
            onClick={(e) => {
              e.stopPropagation()
              onDelete(d)
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </>
  )
}

export function App(): React.JSX.Element {
  const [ws, setWs] = useState<WorkspaceSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const next = await window.api?.workspace.rescan()
    if (next) setWs(next)
  }, [])

  useEffect(() => {
    window.api?.workspace.get().then((snap) => {
      setWs(snap)
      setLoading(false)
    })
  }, [])

  const chooseDir = useCallback(async () => {
    const snap = await window.api?.workspace.choose()
    if (snap) setWs(snap)
  }, [])

  const removeDemo = useCallback(
    async (demo: DemoMeta) => {
      if (!window.confirm(`确定删除演示「${demo.title}」？\n将同时删除该演示的会话，且无法恢复。`)) return
      const snap = await window.api?.workspace.remove(demo.file)
      if (snap) setWs(snap)
    },
    []
  )

  if (loading) return <div style={{ padding: 24 }}>加载中…</div>

  if (!ws) {
    return (
      <div style={{ ...styles.layout, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ margin: 0 }}>物理演示生成器</h2>
        <p style={styles.hint}>选择工作目录：所有生成的演示与会话都保存在这里，拷贝目录即可带走。</p>
        <button style={styles.picker} onClick={chooseDir}>
          选择工作目录…
        </button>
      </div>
    )
  }

  return (
    <div style={styles.layout}>
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <strong style={{ fontSize: 13 }}>演示列表</strong>
          <div style={styles.dirPath}>{ws.dir}</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button onClick={chooseDir} style={{ fontSize: 12, cursor: 'pointer' }}>
              更换目录
            </button>
            <button onClick={refresh} style={{ fontSize: 12, cursor: 'pointer' }}>
              刷新
            </button>
          </div>
        </div>
        <div style={styles.demoList}>
          <DemoList demos={ws.demos} onDelete={removeDemo} />
        </div>
      </aside>
      <main style={styles.main}>
        <p>聊天与预览界面由 ticket 03 实现。</p>
      </main>
    </div>
  )
}
