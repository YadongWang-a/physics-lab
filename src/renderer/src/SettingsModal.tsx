import { useCallback, useEffect, useState } from 'react'
import {
  CUSTOM_PROVIDER_ID,
  DEFAULT_MAIN_SLOT,
  PROVIDER_LABELS,
  type ModelSlotConfig,
  type ModelSlotView,
  type SettingsView,
  type SlotProvider
} from '../../shared/settings-types'

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { width: 560, maxHeight: '86vh', overflowY: 'auto', background: 'var(--pl-card)', borderRadius: 'var(--pl-radius-lg)', boxShadow: 'var(--pl-shadow-3)', padding: 20, border: '1px solid var(--pl-border)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 15, fontWeight: 600, margin: 0 },
  card: { border: '1px solid var(--pl-border)', borderRadius: 'var(--pl-radius-md)', padding: 14, marginBottom: 12, background: 'var(--pl-background)' },
  cardTitle: { fontSize: 13, fontWeight: 600, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  row: { display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' },
  label: { fontSize: 12, color: 'var(--pl-ink-2)', width: 84, flexShrink: 0 },
  input: { flex: 1, border: '1px solid var(--pl-border)', borderRadius: 'var(--pl-radius-sm)', padding: '6px 8px', fontSize: 12, fontFamily: 'inherit', background: 'var(--pl-input)', color: 'var(--pl-foreground)', outline: 'none' },
  select: { border: '1px solid var(--pl-border)', borderRadius: 'var(--pl-radius-sm)', padding: '6px 8px', fontSize: 12, background: 'var(--pl-input)', fontFamily: 'inherit', color: 'var(--pl-foreground)' },
  hint: { fontSize: 11, color: 'var(--pl-muted-foreground)', margin: '4px 0 10px', lineHeight: 1.6 },
  testBtn: { border: '1px solid var(--pl-border)', background: 'var(--pl-card)', borderRadius: 'var(--pl-radius-sm)', padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--pl-foreground)' },
  testOk: { fontSize: 12, color: 'var(--pl-state-success)' },
  testFail: { fontSize: 12, color: 'var(--pl-state-error)', wordBreak: 'break-all' },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  saveBtn: { border: 'none', background: 'var(--pl-primary)', color: 'var(--pl-primary-foreground)', borderRadius: 'var(--pl-radius-sm)', padding: '7px 18px', cursor: 'pointer', fontSize: 13 },
  cancelBtn: { border: '1px solid var(--pl-border)', background: 'var(--pl-card)', borderRadius: 'var(--pl-radius-sm)', padding: '7px 16px', cursor: 'pointer', fontSize: 13, color: 'var(--pl-foreground)' },
  switchBtn: { border: '1px solid var(--pl-border)', background: 'var(--pl-card)', borderRadius: 'var(--pl-radius-sm)', padding: '3px 8px', fontSize: 11, cursor: 'pointer', color: 'var(--pl-foreground)' }
}

interface SlotFormState {
  slot: ModelSlotConfig
  /** Key 输入框（空 = 保持原样） */
  keyInput: string
  models: string[]
  testResult: { ok: boolean; error?: string } | null
  testing: boolean
}

function initForm(view: ModelSlotView | null): SlotFormState {
  const base = view
    ? { provider: view.provider, modelId: view.modelId, baseUrl: view.baseUrl, api: view.api, customModels: view.customModels }
    : { ...DEFAULT_MAIN_SLOT }
  const slot: ModelSlotConfig = base
  // custom 端点：modelId 缺省时跟随第一个模型名
  if (slot.provider === CUSTOM_PROVIDER_ID && !slot.modelId && slot.customModels && slot.customModels.length > 0) {
    slot.modelId = slot.customModels[0]!
  }
  return { slot, keyInput: '', models: [], testResult: null, testing: false }
}

/** 供应商切换 → 动态拉模型列表（custom 手动填） */
function useModels(slot: ModelSlotConfig, setForm: React.Dispatch<React.SetStateAction<SlotFormState | null>>): void {
  useEffect(() => {
    if (slot.provider === CUSTOM_PROVIDER_ID) {
      setForm((prev) => (prev ? { ...prev, models: [] } : prev))
      return
    }
    let alive = true
    window.api?.settings.models(slot.provider).then((models) => {
      if (alive) setForm((prev) => (prev ? { ...prev, models } : prev))
    })
    return () => {
      alive = false
    }
  }, [slot.provider, setForm])
}

export function SettingsModal(props: { onClose: () => void }): React.JSX.Element {
  const [main, setMain] = useState<SlotFormState | null>(null)
  const [visionEnabled, setVisionEnabled] = useState(false)
  const [vision, setVision] = useState<SlotFormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api?.settings.get().then((v: SettingsView) => {
      setMain(initForm(v.main))
      setVisionEnabled(Boolean(v.vision))
      setVision(initForm(v.vision))
    })
  }, [])

  useModels(main?.slot ?? DEFAULT_MAIN_SLOT, setMain)

  const patchSlot = useCallback(
    (kind: 'main' | 'vision', patch: Partial<ModelSlotConfig>) => {
      const setter = kind === 'main' ? setMain : setVision
      setter((prev) => (prev ? { ...prev, slot: { ...prev.slot, ...patch } } : prev))
    },
    []
  )

  const testSlot = useCallback(
    async (kind: 'main' | 'vision') => {
      const form = kind === 'main' ? main : vision
      if (!form) return
      const setter = kind === 'main' ? setMain : setVision
      setter((prev) => (prev ? { ...prev, testing: true, testResult: null } : prev))
      const result = await window.api!.settings.test({
        ...form.slot,
        apiKey: form.keyInput || form.slot.apiKey
      })
      setter((prev) => (prev ? { ...prev, testing: false, testResult: result } : prev))
    },
    [main, vision]
  )

  const save = useCallback(async () => {
    if (!main) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        main: { ...main.slot },
        mainApiKey: main.keyInput || undefined,
        vision: visionEnabled && vision ? { ...vision.slot } : null,
        visionApiKey: visionEnabled && vision && vision.keyInput ? vision.keyInput : undefined
      }
      const saved = await window.api!.settings.save(payload)
      setMain(initForm(saved.main))
      setVisionEnabled(Boolean(saved.vision))
      setVision(initForm(saved.vision))
      props.onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [main, vision, visionEnabled, props])

  if (!main) return <div />

  return (
    <div style={styles.overlay} onClick={props.onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>模型设置</h3>
          <button style={styles.cancelBtn} onClick={props.onClose}>
            关闭
          </button>
        </div>
        <p style={styles.hint}>
          API Key 经系统加密（DPAPI）保存，不会明文落盘；测试只发送一条最小请求。保存后当前会话将按新配置重建。
          <br />
          申请 Key：opencode（opencode.ai/account）或 DeepSeek（platform.deepseek.com）注册后在控制台创建；Key 形如 sk-…。
        </p>

        <SlotCard
          title="主模型（生成演示）"
          form={main}
          canDisable={false}
          onChange={(p) => patchSlot('main', p)}
          onKeyChange={(k) => setMain((prev) => (prev ? { ...prev, keyInput: k } : prev))}
          onTest={() => testSlot('main')}
        />

        <div style={styles.card}>
          <div style={styles.cardTitle}>
            <span>视觉模型（识别题目照片，可选）</span>
            <button style={styles.switchBtn} onClick={() => setVisionEnabled((v) => !v)}>
              {visionEnabled ? '不启用视觉模型' : '启用视觉模型'}
            </button>
          </div>
          {visionEnabled && vision ? (
            <SlotCard
              title=""
              form={vision}
              canDisable={true}
              onChange={(p) => patchSlot('vision', p)}
              onKeyChange={(k) => setVision((prev) => (prev ? { ...prev, keyInput: k } : prev))}
              onTest={() => testSlot('vision')}
            />
          ) : (
            <p style={styles.hint}>未启用：照片识别不可用（贴图时会提示）。启用后配置视觉模型即可自动识别题目图片。</p>
          )}
        </div>

        {error && <p style={styles.testFail}>{error}</p>}
        <div style={styles.footer}>
          <button style={styles.cancelBtn} onClick={props.onClose}>
            取消
          </button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SlotCard(props: {
  title: string
  form: SlotFormState
  canDisable: boolean
  onChange: (patch: Partial<ModelSlotConfig>) => void
  onKeyChange: (key: string) => void
  onTest: () => void
}): React.JSX.Element {
  const { form, onChange, onKeyChange, onTest } = props
  const slot = form.slot
  const isCustom = slot.provider === CUSTOM_PROVIDER_ID

  return (
    <div style={styles.card}>
      {props.title && <div style={styles.cardTitle}>{props.title}</div>}
      <div style={styles.row}>
        <span style={styles.label}>供应商</span>
        <select
          style={styles.select}
          value={slot.provider}
          onChange={(e) => {
            const provider = e.target.value as SlotProvider
            onChange({
              provider,
              modelId: provider === CUSTOM_PROVIDER_ID ? '' : slot.modelId,
              baseUrl: provider === CUSTOM_PROVIDER_ID ? slot.baseUrl : undefined,
              customModels: provider === CUSTOM_PROVIDER_ID ? slot.customModels : undefined
            })
          }}
        >
          {(Object.keys(PROVIDER_LABELS) as SlotProvider[]).map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABELS[p]}
            </option>
          ))}
        </select>
      </div>

      {isCustom ? (
        <>
          <div style={styles.row}>
            <span style={styles.label}>Base URL</span>
            <input
              style={styles.input}
              value={slot.baseUrl ?? ''}
              placeholder="https://api.example.com/v1"
              onChange={(e) => onChange({ baseUrl: e.target.value.trim() })}
            />
          </div>
          <div style={styles.row}>
            <span style={styles.label}>协议</span>
            <select
              style={styles.select}
              value={slot.api ?? 'openai-completions'}
              onChange={(e) => onChange({ api: e.target.value as 'openai-completions' | 'openai-responses' })}
            >
              <option value="openai-completions">OpenAI Chat Completions</option>
              <option value="openai-responses">OpenAI Responses</option>
            </select>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>模型名</span>
            <input
              style={styles.input}
              value={slot.customModels?.join(', ') ?? ''}
              placeholder="qwen-max, qwen-turbo（逗号分隔）"
              onChange={(e) => {
                const models = e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
                const next: Partial<ModelSlotConfig> = { customModels: models }
                // 当前所选模型被删除/清空 → modelId 跟随第一个
                if (!slot.modelId || !models.includes(slot.modelId)) {
                  next.modelId = models[0] ?? ''
                }
                onChange(next)
              }}
            />
          </div>
          {slot.customModels && slot.customModels.length > 0 && (
            <div style={styles.row}>
              <span style={styles.label}>使用模型</span>
              <select
                style={{ ...styles.select, flex: 1 }}
                value={slot.modelId}
                onChange={(e) => onChange({ modelId: e.target.value })}
              >
                {slot.customModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      ) : (
        <div style={styles.row}>
          <span style={styles.label}>模型</span>
          <select
            style={{ ...styles.select, flex: 1 }}
            value={slot.modelId}
            onChange={(e) => onChange({ modelId: e.target.value })}
          >
            {form.models.length === 0 && <option value={slot.modelId}>{slot.modelId}</option>}
            {form.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={styles.row}>
        <span style={styles.label}>API Key</span>
        <input
          style={styles.input}
          type="password"
          value={form.keyInput}
          placeholder={slot.apiKey ? '已保存（留空保持不变）' : 'sk-…（必填）'}
          onChange={(e) => onKeyChange(e.target.value)}
        />
      </div>

      <div style={styles.row}>
        <button style={styles.testBtn} onClick={onTest} disabled={form.testing}>
          {form.testing ? '测试中…' : '测试连接'}
        </button>
        {form.testResult &&
          (form.testResult.ok ? (
            <span style={styles.testOk}>连接成功</span>
          ) : (
            <span style={styles.testFail}>失败：{form.testResult.error}</span>
          ))}
      </div>
    </div>
  )
}
