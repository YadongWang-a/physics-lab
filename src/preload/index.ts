import { contextBridge, ipcRenderer } from 'electron'
import type { ChatHistoryEntry, ImagePayload, RendererApi, WorkspaceChangedPayload, WorkspaceSnapshot } from '../shared/ipc-types'
import type { ModelSlotConfig, SaveSettingsPayload, SettingsView } from '../shared/settings-types'

const api: RendererApi = {
  ping: (): string => 'pong',
  workspace: {
    choose: (): Promise<WorkspaceSnapshot | null> => ipcRenderer.invoke('workspace:choose'),
    get: (): Promise<WorkspaceSnapshot | null> => ipcRenderer.invoke('workspace:get'),
    rescan: (): Promise<WorkspaceSnapshot> => ipcRenderer.invoke('workspace:rescan'),
    remove: (file: string): Promise<WorkspaceSnapshot> =>
      ipcRenderer.invoke('workspace:remove', file)
  },
  chat: {
    send: (file: string | null, text: string, images?: ImagePayload[], sessionKey?: string): Promise<{ ok: boolean; key: string }> =>
      ipcRenderer.invoke('chat:send', file, text, images, sessionKey),
    abort: (file: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('chat:abort', file),
    history: (file: string): Promise<ChatHistoryEntry[]> => ipcRenderer.invoke('chat:history', file),
    onEvent: (cb) => {
      const listener = (_e: unknown, payload: { file: string; event: unknown }): void => cb(payload)
      ipcRenderer.on('chat:event', listener)
      return () => ipcRenderer.removeListener('chat:event', listener)
    }
  },
  preview: {
    onChanged: (cb) => {
      const listener = (_e: unknown, payload: { file: string }): void => cb(payload)
      ipcRenderer.on('preview:changed', listener)
      return () => ipcRenderer.removeListener('preview:changed', listener)
    },
    onWorkspaceChanged: (cb) => {
      const listener = (_e: unknown, payload: unknown): void => cb(payload as WorkspaceChangedPayload)
      ipcRenderer.on('workspace:changed', listener)
      return () => ipcRenderer.removeListener('workspace:changed', listener)
    }
  },
  window: {
    setFullscreen: (flag: boolean): Promise<void> => ipcRenderer.invoke('window:set-fullscreen', flag),
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: (): Promise<void> => ipcRenderer.invoke('window:toggle-maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close')
  },
  settings: {
    get: (): Promise<SettingsView> => ipcRenderer.invoke('settings:get'),
    save: (payload: SaveSettingsPayload): Promise<SettingsView> =>
      ipcRenderer.invoke('settings:save', payload),
    models: (provider: string): Promise<string[]> => ipcRenderer.invoke('settings:models', provider),
    test: (slot: ModelSlotConfig): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('settings:test', { slot }),
    onChanged: (cb) => {
      const listener = (): void => cb()
      ipcRenderer.on('settings:changed', listener)
      return () => ipcRenderer.removeListener('settings:changed', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = RendererApi
