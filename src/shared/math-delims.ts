/**
 * LaTeX 圆括号/方括号定界符 → 美元定界符。
 * remark-math 只认 $/$$，而模型输出常写 \(…\) 与 \[…\]（聊天渲染需兼容）。
 * 代码块与行内代码不动；必须成对的 \( … \) 才转换，普通括号/未配对定界符不受影响。
 */
export function normalizeMathDelims(src: string): string {
  return src
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .replace(/\\\(([\s\S]*?)\\\)/g, (_m, tex: string) => `$${tex}$`)
            .replace(/\\\[([\s\S]*?)\\\]/g, (_m, tex: string) => `$$${tex}$$`)
    )
    .join('')
}
