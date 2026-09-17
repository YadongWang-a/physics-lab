import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { normalizeMathDelims } from '../../shared/math-delims'
import 'katex/dist/katex.min.css'

/**
 * 助手消息 markdown 渲染：GFM（表格/删除线/任务列表）+ 数学公式（KaTeX）。
 * react-markdown 默认不渲染原始 HTML，避免 XSS；公式经 rehype-katex 安全输出。
 * 兼容 \(…\) 与 \[…\] 定界符（模型输出常见），统一转成 $/$$ 后交给 remark-math。
 */
function MarkdownImpl({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {normalizeMathDelims(text)}
      </ReactMarkdown>
    </div>
  )
}

/** memo：流式批量落消息时历史消息不再全量重解析（react-markdown+KaTeX 开销大，是渲染层 OOM 的主要来源） */
export const Markdown = memo(MarkdownImpl)
