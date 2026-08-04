// tab-manager 测试（TDD 红 → 绿）
// Seams: A) 同文件复用  B) null=新建  C) 不同文件独立  D) 文件扫描  E) onChange  F) dispose
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { createTabManager } = require('../src/tab-manager');

describe('TabManager', () => {
  let workdir, tm, agentsCreated;

  function fakeFactory({ workdir, llm, file, onRename }) {
    agentsCreated.push({ workdir, llm, file, onRename });
    return Promise.resolve({
      file,
      _subscribed: false,
      send: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockReturnValue(() => {}),
      dispose: vi.fn(),
    });
  }

  beforeEach(() => {
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-mgr-'));
    agentsCreated = [];
    tm = createTabManager({
      workdir,
      llm: { baseUrl: 'x', apiKey: 'k', model: 'm' },
      agentFactory: fakeFactory,
    });
  });

  afterEach(() => {
    if (tm && tm.dispose) tm.dispose();
    try { fs.rmSync(workdir, { recursive: true, force: true }); } catch {}
  });

  // ── Seam A：同文件复用 ──
  it('getOrCreate returns same agent for same file path', async () => {
    const a1 = await tm.getOrCreate('ball-spring.html');
    const a2 = await tm.getOrCreate('ball-spring.html');
    expect(a1).toBe(a2);
    expect(agentsCreated.length).toBe(1);
  });

  // ── Seam B：null 哨兵 = 新建演示 ──
  it('getOrCreate(null) creates agent with file=null (new demo)', async () => {
    await tm.getOrCreate(null);
    expect(agentsCreated.length).toBe(1);
    expect(agentsCreated[0].file).toBeNull();
  });

  // ── Seam C：不同文件 = 独立 agent（ADR 0004 1:1） ──
  it('different files get different agents', async () => {
    const a1 = await tm.getOrCreate('a.html');
    const a2 = await tm.getOrCreate('b.html');
    expect(a1).not.toBe(a2);
    expect(agentsCreated.length).toBe(2);
  });

  // ── Seam D：listFiles 扫描标记文件 ──
  it('listFiles scans for physics-demo marked .html files', () => {
    fs.writeFileSync(path.join(workdir, 'a.html'), '<!-- physics-demo: Alpha -->', 'utf8');
    fs.writeFileSync(path.join(workdir, 'b.html'), '<!-- physics-demo: Beta -->', 'utf8');
    fs.writeFileSync(path.join(workdir, 'c.txt'), 'not html', 'utf8');
    fs.writeFileSync(path.join(workdir, 'd.html'), 'no marker', 'utf8');
    const list = tm.listFiles();
    expect(list).toHaveLength(2);
    expect(list.map(t => t.title)).toEqual(['Alpha', 'Beta']);
  });

  // ── Seam E：onChange 通知 ──
  it('onChange fires with updated tab list when files change', () => {
    const cb = vi.fn();
    tm.onChange(cb);
    fs.writeFileSync(path.join(workdir, 'new.html'), '<!-- physics-demo: New File -->', 'utf8');
    tm._notifyChange();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toHaveLength(1);
    expect(cb.mock.calls[0][0][0].title).toBe('New File');
  });

  // ── Seam F：dispose 清理 ──
  it('dispose calls agent dispose and clears listeners', async () => {
    const a = await tm.getOrCreate('a.html');
    const cb = vi.fn();
    tm.onChange(cb);
    tm.dispose();
    expect(a.dispose).toHaveBeenCalled();
  });

  // ── 附加：activePath 跟踪 ──
  it('activePath tracks the last getOrCreate file', async () => {
    await tm.getOrCreate('a.html');
    expect(tm.activePath).toBe('a.html');
    await tm.getOrCreate('b.html');
    expect(tm.activePath).toBe('b.html');
    await tm.getOrCreate(null);
    expect(tm.activePath).toBeNull();
  });

  // ── Seam H：并发防护（getOrCreate 同文件并发只创建一次 agent） ──
  it('concurrent getOrCreate for same file creates only one agent', async () => {
    // 用延迟的 factory 模拟耗时创建，暴露"进行中 agents.has 仍为 false"的竞态
    let resolveCreate;
    const slowFactory = ({ workdir, llm, file, onRename }) => {
      agentsCreated.push({ file });
      return new Promise((resolve) => { resolveCreate = () => resolve({
        file, _subscribed: false, send: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn().mockReturnValue(() => {}), dispose: vi.fn(),
      }); });
    };
    const slowTm = createTabManager({
      workdir, llm: { baseUrl: 'x', apiKey: 'k', model: 'm' }, agentFactory: slowFactory,
    });
    try {
      // 两次并发调用（都未 resolve 前）
      const p1 = slowTm.getOrCreate('a.html');
      const p2 = slowTm.getOrCreate('a.html');
      expect(agentsCreated.length).toBe(1); // 第二次复用进行中的创建，不新建
      resolveCreate();
      const [a1, a2] = await Promise.all([p1, p2]);
      expect(a1).toBe(a2); // 同一个 agent 实例
      expect(agentsCreated.length).toBe(1);
    } finally {
      slowTm.dispose();
    }
  });

  // ── Seam G：改名重挂（write_demo 写新文件名 → rekey，ADR 0013） ──
  it('rekey moves the agent to the new path and updates activePath', async () => {
    const a = await tm.getOrCreate('a.html');
    const cb = vi.fn();
    tm.onChange(cb);
    tm.rekey('a.html', 'b.html');
    expect(tm.activePath).toBe('b.html');
    // 复用同一 agent 实例
    const a2 = await tm.getOrCreate('b.html');
    expect(a2).toBe(a);
    expect(agentsCreated.length).toBe(1);
    // 旧路径不再命中
    expect(await tm.getOrCreate('a.html')).not.toBe(a);
    // 通知触发
    expect(cb).toHaveBeenCalled();
  });

  it('agentFactory 收到 onRename 回调且回调会重挂 key', async () => {
    const a = await tm.getOrCreate('a.html');
    const args = agentsCreated.find((x) => x.file === 'a.html');
    expect(typeof args.onRename).toBe('function');
    args.onRename('a.html', 'renamed.html');
    expect(tm.activePath).toBe('renamed.html');
    const again = await tm.getOrCreate('renamed.html');
    expect(again).toBe(a);
  });
});
