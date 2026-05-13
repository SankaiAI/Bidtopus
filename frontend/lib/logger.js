/**
 * Server-side logger. Writes to logs/frontend.log in development only.
 * Import and use in API routes — never in client components.
 *
 * Usage:
 *   import { log } from '@/lib/logger'
 *   log('info',  'agent/route', 'request received', { message: '...' })
 *   log('error', 'agent/route', 'stream failed',    { error: err.message })
 */

import fs   from 'fs'
import path from 'path'

const isDev     = process.env.NODE_ENV !== 'production'
const LOG_FILE  = path.join(process.cwd(), 'logs', 'frontend.log')
const MAX_BYTES = 5 * 1024 * 1024  // rotate at 5 MB

function rotate() {
  try {
    const stat = fs.statSync(LOG_FILE)
    if (stat.size > MAX_BYTES) {
      fs.renameSync(LOG_FILE, LOG_FILE.replace('.log', '.1.log'))
    }
  } catch { /* file doesn't exist yet — fine */ }
}

function write(line) {
  try {
    rotate()
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
