import { useState } from 'react'
import type { WorkspaceSnapshot } from '../../shared/ipc-types'

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { width: 460, background: 'var(--pl-card)', borderRadius: 'var(--pl-radius-xl)', boxShadow: 'var(--pl-shadow-3)', padding: 28, border: '1px solid var(--pl-border)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 14 },
  headerLogo: { width: 34, height: 34, borderRadius: 10, background: 'var(--grad-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(37,99,235,.35)', flexShrink: 0 },
  title: { fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', margin: 0 },
  body: { fontSize: 13, color: 'var(--pl-ink-2)', lineHeight: 1.7, margin: '0 0 18px' },
  pickBtn: { width: '100%', padding: '12px 18px', fontSize: 14, border: '1px dashed var(--pl-border)', borderRadius: 'var(--pl-radius-lg)', background: 'var(--pl-background)', cursor: 'pointer', color: 'var(--pl-primary)', fontWeight: 600 },
  hint: { fontSize: 11, color: 'var(--pl-muted-foreground)', margin: '14px 0 0', lineHeight: 1.6 },
  closeBtn: { width: 28, height: 28, border: 'none', background: 'transparent', color: 'var(--pl-muted-foreground)', cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }
}

/** 工作目录选择对话框：首次启动与关闭工作空间后引导选择（替代全屏空态） */
export function WorkspaceDialog(props: { onPick: (snap: WorkspaceSnapshot) => void; onClose: () => void }): React.JSX.Element {
  const [picking, setPicking] = useState(false)
  const pick = async (): Promise<void> => {
    setPicking(true)
    try {
      const snap = await window.api?.workspace.choose()
      if (snap) props.onPick(snap)
    } finally {
      setPicking(false)
    }
  }
  return (
    <div style={styles.overlay} onClick={props.onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={styles.headerLogo}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
            </div>
            <h3 style={styles.title}>选择工作目录</h3>
          </div>
          <button className="icon-btn" title="暂不选择" aria-label="关闭" onClick={props.onClose} style={styles.closeBtn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <p style={styles.body}>
          所有生成的演示与会话都保存在工作目录里，拷贝目录即可带走。选择一个文件夹（不存在则自动创建）作为当前工作空间。
        </p>
        <button style={styles.pickBtn} onClick={() => void pick()} disabled={picking}>
          {picking ? '正在打开目录选择…' : '📂 浏览并选择目录…'}
        </button>
        <p style={styles.hint}>
          选择后立即切换到该工作空间；点右上角「暂不选择」可稍后再选，左上角列表头部随时可切换。
        </p>
      </div>
    </div>
  )
}
