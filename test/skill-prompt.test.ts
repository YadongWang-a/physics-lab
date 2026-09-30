import { describe, it, expect } from 'vitest'
import { PHYSICS_SKILL_PROMPT } from '../src/main/agent/physics-skill-prompt'

describe('physics-skill-prompt：对话内公式与标题格式规范（ticket：chat 公式显示）', () => {
  it('要求 LaTeX 公式书写（编译后为单反斜杠）', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('$t=\\sqrt{2h/g}$')
    expect(PHYSICS_SKILL_PROMPT).toContain('$h=\\frac{1}{2}gt^2$')
  })
  it('禁止 Unicode 文本公式与加粗伪标题', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('禁止用 Unicode 文本公式')
    expect(PHYSICS_SKILL_PROMPT).toContain('禁止用整段加粗冒充标题')
  })
  it('要求小节标题用 ###', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('小节标题用 ###')
  })
})

describe('physics-skill-prompt：生成流程步骤链（ADR-0005）', () => {
  it('步骤链为 分析题目 → 物理模型 → 解答与答案核对 → 临界状态 → 物理量 → 图像 → 落地', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('走完 §1→§7')
    expect(PHYSICS_SKILL_PROMPT).toContain('### 2. 物理模型')
    expect(PHYSICS_SKILL_PROMPT).toContain('### 7. 落地')
    // 命名与 lib 不再单列步骤
    expect(PHYSICS_SKILL_PROMPT).not.toContain('### 4. 命名')
    expect(PHYSICS_SKILL_PROMPT).not.toContain('### 5. 确认 lib')
  })
  it('2D/3D 判据为"默认 2D，仅当能指出非三维不可才 3D"', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('默认 2D')
    expect(PHYSICS_SKILL_PROMPT).toContain('非三维不可')
  })
  it('答案在推导完成之后索取，并停下等待核对', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('**对答案**')
    expect(PHYSICS_SKILL_PROMPT).toContain('停下等待')
    expect(PHYSICS_SKILL_PROMPT).not.toContain('先索取答案/解析')
  })
  it('物理量表给出量、计算式与承载通道；图像按判据决定画或不画', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('讲解点证据表')
    expect(PHYSICS_SKILL_PROMPT).toContain('承载通道')
    expect(PHYSICS_SKILL_PROMPT).toContain('title')
  })
  it('讲解点是三节共同的索引：证据表、图、时刻表都挂在它上面', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('**产出讲解点**')
    expect(PHYSICS_SKILL_PROMPT).toContain('没有讲解点的量不出现')
    expect(PHYSICS_SKILL_PROMPT).toContain('每个阶段边界就是一个**讲解点**的时刻')
  })
  it('核对证据必须落在投影可见面内，图例是编码解码表', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('投影可见面')
    expect(PHYSICS_SKILL_PROMPT).toContain('唯一解码入口')
  })
  it('落地与分析交错：落盘时刻写进各步完成条件（§1 建文件 → §2 模型 → §3 解析卡 → 对答案后其余）', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('边分析边落地')
    expect(PHYSICS_SKILL_PROMPT).toContain('**先落文件, 再讲推导**')
    expect(PHYSICS_SKILL_PROMPT).toContain('**可运行的空页面已写入 `当前目录/<文件名>`**')
    expect(PHYSICS_SKILL_PROMPT).toContain('**基本模型已 `edit` 落盘**')
    expect(PHYSICS_SKILL_PROMPT).toContain('**解析卡已 `edit` 落盘**')
    expect(PHYSICS_SKILL_PROMPT).toContain('增量补 `@slot`')
    expect(PHYSICS_SKILL_PROMPT.indexOf('核对(§4/§5/§6 ↔ §2/§3)')).toBeLessThan(
      PHYSICS_SKILL_PROMPT.indexOf('4. 语法与 ID')
    )
    // 不再有"每落一段就跑 check_demo"或"对答案之后才开始落地"的门（实测五段闸门 0/4 触发）
    expect(PHYSICS_SKILL_PROMPT).not.toContain('每落一段')
    expect(PHYSICS_SKILL_PROMPT).not.toContain('对答案通过后开始')
  })
  it('临界状态只认推导的阶段边界，不得新增无出处时刻', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('不得新增推导里没有出处的时刻')
  })
  it('合成/分解的构造本身是讲解点证据（只画原始力不算，且只出现所选那一种）', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('证据是**合成或分解的构造本身**')
    expect(PHYSICS_SKILL_PROMPT).toContain('只画原始的几个力、或同时叠两种画法都不算')
    expect(PHYSICS_SKILL_PROMPT).toContain('**画法与推导一致**')
    expect(PHYSICS_SKILL_PROMPT).toContain('画面上就**只出现那一种**')
  })
})
