import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export const listFiles = (path = '') =>
  invoke('list_files', { path: path || null })

export const readFile = (path) =>
  invoke('read_file', { path })

export const writeFile = (path, content) =>
  invoke('write_file', { path, content })

export const createItem = (path, isDirectory) =>
  invoke('create_item', { path, isDirectory })

export const deleteItem = (path) =>
  invoke('delete_item', { path })

export const renameItem = (oldPath, newPath) =>
  invoke('rename_item', { oldPath, newPath })

export const setRoot = (path) =>
  invoke('set_root', { path })

export const getRoot = () =>
  invoke('get_root')

export const pickFolder = () =>
  invoke('pick_folder')

export const onFileChanged = (callback) =>
  listen('file-changed', (event) => callback(event.payload))
