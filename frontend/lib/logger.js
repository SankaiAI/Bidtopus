/**
 * Server-side logger. Each process start writes to its own timestamped file
 * under logs/frontend-YYYY-MM-DDTHH-mm-ss.log (dev only).
 * Import and use in API routes — never in client components.
 *
 * Usage:
 *   import { log } from '@/lib/logger'
 *   log('info',  'agent/route', 'request received', { message: '...' })
 *   log('error', 'agent/route', 'stream failed',    { error: err.message })
 */

import fs   from 'fs'
import path from 'path'

const isDev    = process.env.NODE_ENV !== 'production'
const LOG_DIR  = path.join(process.cwd(), 'logs')

// One file per process start — timestamp uses dashes so it's valid on Windows
const startTs  = new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z')
const LOG_FILE = path.join(LOG_DIR, `frontend-${startTs}.log`)

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
}

function write(line) {
  try {
    ensureDir()
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8')
  } catch (e) {
    // Never let logging crash the app
    console.warn('[logger] could not write to log file:', e.message)
  }
}

/**
 * @param {'info'|'warn'|'error'|'debug'} level
 * @param {string} source   short label e.g. 'api/agent'
 * @param {string} message
 * @param {object} [data]   any extra context — serialized as JSON
 */
export function log(level, source, message, data) {
  const ts   = new Date().toISOString()
  const tag  = `[${ts}] [${level.toUpperCase().padEnd(5)}] [${source}]`
  const body = data !== undefined ? `${message} ${JSON.stringify(data)}` : message

  // Always log to console (Next.js dev server captures this)
  const consoleFn = level === 'error' ? console.error
                  : level === 'warn'  ? console.warn
                  : console.log
  consoleFn(`${tag} ${body}`)

  // Write to file in dev only
  if (isDev) write(`${tag} ${body}`)
}

// Convenience wrappers
export const logInfo  = (src, msg, data) => log('info',  src, msg, data)
export const logWarn  = (src, msg, data) => log('warn',  src, msg, data)
export const logError = (src, msg, data) => log('error', src, msg, data)
export const logDebug = (src, msg, data) => log('debug', src, msg, data)
