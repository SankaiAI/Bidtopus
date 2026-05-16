'use client'
import React from 'react'
import { useParams } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { createApiClient } from '@/lib/api'
import { isUUID } from '@/hooks/useNegotiationStream'
import NegotiationView from '@/components/workspace/NegotiationView'
import WorkspaceView from '@/components/workspace/WorkspaceView'
import { C } from '@/components/workspace/constants'

function LoadingDots() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
      <div style={{ display: 'flex', gap: '5px' }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: C.indigo, animation: 'agentDotBounce 1.1s ease-in-out infinite', animationDelay: `${i * 0.18}s` }} />
        ))}
      </div>
    </div>
  )
}

export default function WorkspacePage() {
  const { id } = useParams()
  const { getToken, isLoaded, isSignedIn } = useAuth()

  // Local ws_xxx sessions go straight to negotiation — no API call needed
  const [mode, setMode] = React.useState(() => isUUID(id) ? 'loading' : 'negotiation')
  const [contract, setContract] = React.useState(null)

  React.useEffect(() => {
    if (!isUUID(id)) return
    if (!isLoaded) return
    if (!isSignedIn) { setMode('negotiation'); return }

    createApiClient(getToken).getContract(id)
      .then(c => {
        setContract(c)
        setMode(c.status === 'negotiating' ? 'negotiation' : 'workspace')
      })
      .catch(() => setMode('negotiation'))
  }, [id, isLoaded, isSignedIn])

  if (mode === 'loading') return <LoadingDots />

  if (mode === 'negotiation') {
    return (
      <NegotiationView
        sessionId={id}
        onFinalized={c => { setContract(c); setMode('workspace') }}
      />
    )
  }

  return <WorkspaceView id={id} contract={contract} />
}
