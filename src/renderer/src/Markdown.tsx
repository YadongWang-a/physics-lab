import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

/**
 * 助手消息 markdown 渲染：GFM（表格/删除线/任务列表）+ 数学公式（KaTeX）。
 * react-markdown 默认不渲染原始 HTML，避免 XSS；公式经 rehype-katex 安全输出。
 */
export function Markdown({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
