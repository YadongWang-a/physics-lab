import { contextBridge, ipcRenderer } from 'electron'
import type { RendererApi, WorkspaceSnapshot } from '../shared/ipc-types'

const api: RendererApi = {
  ping: (): string => 'pong',
  workspace: {
    choose: (): Promise<WorkspaceSnapshot | null> => ipcRenderer.invoke('workspace:choose'),
    get: (): Promise<WorkspaceSnapshot | null> => ipcRenderer.invoke('workspace:get'),
    rescan: (): Promise<WorkspaceSnapshot> => ipcRenderer.invoke('workspace:rescan'),
    remove: (file: string): Promise<WorkspaceSnapshot> =>
      ipcRenderer.invoke('workspace:remove', file)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = RendererApi
