import { contextBridge, ipcRenderer } from 'electron'
import type { ChatHistoryEntry, RendererApi, WorkspaceSnapshot } from '../shared/ipc-types'

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
    send: (file: string | null, text: string): Promise<{ ok: boolean; key: string }> =>
      ipcRenderer.invoke('chat:send', file, text),
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
      const listener = (): void => cb()
      ipcRenderer.on('workspace:changed', listener)
      return () => ipcRenderer.removeListener('workspace:changed', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = RendererApi
