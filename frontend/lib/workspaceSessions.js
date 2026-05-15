const STORAGE_KEY = 'outcomex_workspaces'
const UPDATE_EVENT = 'outcomex_workspaces_updated'

function read() {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

function write(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  window.dispatchEvent(new Event(UPDATE_EVENT))
}

export function getAllSessions() {
  return read()
}

export function getSession(id) {
  return read().find(s => s.id === id) ?? null
}

export function upsertSession(id, patch) {
  const all = read()
  const idx = all.findIndex(s => s.id === id)
  if (idx === -1) {
    all.unshift({ id, title: 'New conversation', createdAt: new Date().toISOString(), ...patch })
  } else {
    all[idx] = { ...all[idx], ...patch }
  }
  write(all)
}

export function deleteSession(id) {
  write(read().filter(s => s.id !== id))
}

export function subscribeToSessions(handler) {
  window.addEventListener(UPDATE_EVENT, handler)
  return () => window.removeEventListener(UPDATE_EVENT, handler)
}

export function generateSessionId() {
  return 'ws_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}
