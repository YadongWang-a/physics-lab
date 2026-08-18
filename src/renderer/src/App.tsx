export function App(): React.JSX.Element {
  const api = (window as unknown as { api?: { ping: () => string } }).api
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, "Microsoft YaHei", sans-serif' }}>
      <h1>物理演示生成器</h1>
      <p>工程骨架就绪（ticket 01）。聊天与预览界面由后续 ticket 实现。</p>
      <p>
        预加载桥接：<code>{api ? api.ping() : '未加载'}</code>
      </p>
    </div>
  )
}
