import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const LIB_FILES = ['common.css', 'common.js', 'mathjax.js']

/**
 * 把 skill 自带 lib/ 三件套预置到工作目录（仅缺失时复制）。
 * 目的：skill 流程 step 5 要求"拷贝 lib"，但 mathjax.js 约 2.1MB，
 * 若由 agent 经 read/write 拷贝会整文件进上下文（token 爆炸）——
 * 应用层预置后 agent 只需确认存在（见 SKILL_SYSTEM_PROMPT ⑤）。
 * lib 文件保持与 skill 完全一致（只读来源），不修改内容。
 */
export function seedLibIntoWorkspace(workspaceDir: string, skillDir: string): void {
  const src = join(skillDir, 'lib')
  if (!existsSync(src)) return
  const dest = join(workspaceDir, 'lib')
  mkdirSync(dest, { recursive: true })
  for (const file of LIB_FILES) {
    const s = join(src, file)
    const d = join(dest, file)
    if (!existsSync(d) && existsSync(s)) copyFileSync(s, d)
  }
}
