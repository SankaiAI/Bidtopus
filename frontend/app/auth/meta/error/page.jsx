'use client'
import { useEffect } from 'react'

export default function MetaOAuthError() {
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage({ type: 'meta_oauth_error' }, window.location.origin)
      window.close()
    }
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Plus Jakarta Sans, sans-serif', color: '#3d3c54', fontSize: '14px' }}>
      Connection failed. Closing…
    </div>
  )
}
