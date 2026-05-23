'use client'
import { useEffect } from 'react'

export default function MetaOAuthSuccess() {
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage({ type: 'meta_oauth_success' }, '*')
      window.close()
    }
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Plus Jakarta Sans, sans-serif', color: '#3d3c54', fontSize: '14px' }}>
      Connected! Closing…
    </div>
  )
}
