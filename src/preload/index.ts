import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { API_METHODS, EVENT, type WindowApi } from '@shared/api'

const api: Record<string, unknown> = {}
for (const [group, methods] of Object.entries(API_METHODS)) {
  const target: Record<string, unknown> = {}
  for (const method of methods) {
    target[method] = (...args: unknown[]) => ipcRenderer.invoke(`${group}:${method}`, ...args)
  }
  api[group] = target
}

function listen<T>(channel: string) {
  return (cb: (payload: T) => void) => {
    const handler = (_e: IpcRendererEvent, payload: T) => cb(payload)
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  }
}

api.onCommand = listen(EVENT.command)
api.onImportProgress = listen(EVENT.importProgress)
api.onHealth = listen(EVENT.health)
api.onLocalScan = listen(EVENT.localScan)
api.onEq = listen(EVENT.eq)

contextBridge.exposeInMainWorld('api', api as unknown as WindowApi)
