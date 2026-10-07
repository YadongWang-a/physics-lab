import { describe, it, expect } from 'vitest'
import { PHYSICS_SKILL_PROMPT } from '../src/main/agent/physics-skill-prompt'

describe('physics-skill-prompt：对话内公式与标题格式规范（ticket：chat 公式显示）', () => {
  it('要求 LaTeX 公式书写（编译后为单反斜杠）', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('$t=\\sqrt{2h/g}$')
    expect(PHYSICS_SKILL_PROMPT).toContain('$h=\\frac{1}{2}gt^2$')
  })
  it('公式与标题都写成正面要求', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('公式一律用 $...$')
    expect(PHYSICS_SKILL_PROMPT).toContain('小节标题一律用 ###')
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
  it('新建演示一个回合内走完：推导可见后接着落地，不问不停（ADR-0005 修订）', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('一个回合内走完 §1→§7')
    expect(PHYSICS_SKILL_PROMPT).toContain('**推导可见且不中断**')
    expect(PHYSICS_SKILL_PROMPT).toContain('**可见文本**')
    expect(PHYSICS_SKILL_PROMPT).toContain('推导必须写进给用户的消息')
    expect(PHYSICS_SKILL_PROMPT).toContain('其余一律不问、不停')
    expect(PHYSICS_SKILL_PROMPT).not.toContain('止轮')
    expect(PHYSICS_SKILL_PROMPT).not.toContain('[选项] 按此推导落地')
  })
  it('解题封闭 + 结论冻结 + 演示只搬运（封口判据取代开放判据）', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('**封口判据(本步唯一的终点)**')
    expect(PHYSICS_SKILL_PROMPT).toContain('**题面未问的要素**')
    expect(PHYSICS_SKILL_PROMPT).toContain('**同一假设被否决两次 → 停**')
    expect(PHYSICS_SKILL_PROMPT).toContain('**结论冻结**')
    expect(PHYSICS_SKILL_PROMPT).toContain('**只搬运, 不求解**')
    expect(PHYSICS_SKILL_PROMPT).toContain('一步代数导出')
    // 两条开放判据不再作为完成条件
    expect(PHYSICS_SKILL_PROMPT).not.toContain('已唯一确定')
    expect(PHYSICS_SKILL_PROMPT).not.toContain('覆盖运动过程各阶段的守恒律')
  })
  it('未给答案时不索取答案；给了答案才核对', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('**对答案(仅在题面/用户已给答案时)**')
    expect(PHYSICS_SKILL_PROMPT).toContain('结论只由推导得出')
    expect(PHYSICS_SKILL_PROMPT).not.toContain('[选项] 有答案')
    expect(PHYSICS_SKILL_PROMPT).not.toContain('先索取答案/解析')
  })
  it('物理量表给出量、计算式与承载通道；图像按判据决定画或不画', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('**产出图清单**(演示段的投影产物')
    expect(PHYSICS_SKILL_PROMPT).toContain('承载通道')
    expect(PHYSICS_SKILL_PROMPT).toContain('title')
  })
  it('图清单只在演示轮生成一次，缺行核对交给 check_demo 的 drawList（ADR-0006）', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('传给 `drawList`')
    expect(PHYSICS_SKILL_PROMPT).toContain('以 `check_demo` 的 issues 为准')
    expect(PHYSICS_SKILL_PROMPT).not.toContain('§3 图清单')
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
  it('落盘只两笔：骨架（分析轮）→ 一次补齐（落地轮）（ADR-0007 修订）', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('落盘只两笔')
    expect(PHYSICS_SKILL_PROMPT).toContain('**先落文件, 再讲推导**')
    expect(PHYSICS_SKILL_PROMPT).toContain('**可运行的空页面已写入 `当前目录/<文件名>`**')
    expect(PHYSICS_SKILL_PROMPT).toContain('**一次补齐**(演示段')
    expect(PHYSICS_SKILL_PROMPT).toContain('增量补 `@slot`')
    expect(PHYSICS_SKILL_PROMPT).toContain('基本模型与解析卡均已 `edit` 落盘')
    // 语义核对排在可见性自审之前
    expect(PHYSICS_SKILL_PROMPT.indexOf('语义核对(§4/§5/§6 ↔ §2/§3)')).toBeLessThan(
      PHYSICS_SKILL_PROMPT.indexOf('3. 可见性')
    )
    // 不再有"每落一段就跑 check_demo"或"对答案之后才开始落地"的门
    expect(PHYSICS_SKILL_PROMPT).not.toContain('每落一段')
    expect(PHYSICS_SKILL_PROMPT).not.toContain('对答案通过后')
  })
  it('临界状态只认推导的阶段边界', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('时刻表只取 §3 的阶段边界')
  })
  it('写后不回读 + 命名查重靠注入名单（不 ls、不询问）', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('**写后不回读**')
    expect(PHYSICS_SKILL_PROMPT).toContain('重名按系统提示里的「工作目录现有演示」名单换名')
    expect(PHYSICS_SKILL_PROMPT).not.toContain('重名先问用户')
  })
  it('改已有演示一律原地改（含换维度），-3d 后缀只约束新建', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('**换维度 2D↔3D**')
    expect(PHYSICS_SKILL_PROMPT).toContain('不另建 `-3d` 文件、不改名')
    expect(PHYSICS_SKILL_PROMPT).toContain('(**新建演示**按 §7 用 `-3d` 后缀命名')
  })
  it('3D 演示指向 drawing.md §11 的取景自查', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('**3D 演示另按 [drawing.md](drawing.md) §11 的取景自查**')
  })
  it('合成/分解的构造本身是讲解点证据，画法须与推导一致', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('证据是**合成或分解的构造本身**')
    expect(PHYSICS_SKILL_PROMPT).toContain('推导所选的那一种')
    expect(PHYSICS_SKILL_PROMPT).toContain('**画法与推导一致**')
  })
  it('纯解答分支：只给答案、不建文件、不产出演示产物（用于隔离"题目复杂度"变量）', () => {
    expect(PHYSICS_SKILL_PROMPT).toContain('**纯解答/纯问答**')
    expect(PHYSICS_SKILL_PROMPT).toContain('只给答案')
    expect(PHYSICS_SKILL_PROMPT).toContain('不建文件、不产出任何演示产物')
    expect(PHYSICS_SKILL_PROMPT).toContain('§3 只保留 假设清单 / 推导(可见文本) / 对答案 / 公式格式')
    // 建文件的闸门只对新建演示生效
    expect(PHYSICS_SKILL_PROMPT).toContain('(新建演示)**可运行的空页面已写入')
  })
})

describe('physics-skill-prompt：单源化与"正说替代禁止"的裁剪纪律（ADR-0010）', () => {
  it('正文不再用禁止句，改为陈述目标行为', () => {
    expect(PHYSICS_SKILL_PROMPT).not.toContain('禁止')
    expect(PHYSICS_SKILL_PROMPT).not.toContain('不得')
  })
  it('骨架机制只在一处展开（§7 步骤 1），其余为指针', () => {
    expect(PHYSICS_SKILL_PROMPT.match(/骨架逐行保留/g)).toHaveLength(1)
  })
})
