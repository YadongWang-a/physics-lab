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

  function fakeFactory({ workdir, llm, file }) {
    agentsCreated.push({ workdir, llm, file });
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
});
