import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { UiPrefsStore } from '../src/main/workspace/ui-prefs'

describe('UiPrefsStore：UI 偏好存取', () => {
  it('save/load 往返（previewZoom）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uiprefs-test-'))
    const store = UiPrefsStore.at(dir)
    store.save({ previewZoom: 0.75 })
    expect(store.load().previewZoom).toBe(0.75)
  })

  it('损坏的 ui-prefs.json → 空偏好（不抛）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uiprefs-test-'))
    writeFileSync(join(dir, 'ui-prefs.json'), '{not json', 'utf8')
    expect(UiPrefsStore.at(dir).load()).toEqual({})
  })

  it('缺失文件 → 空偏好（不抛）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uiprefs-test-'))
    expect(UiPrefsStore.at(dir).load()).toEqual({})
  })
})
