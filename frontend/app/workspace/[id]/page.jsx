'use client'
import React from 'react'
import { useParams } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { createApiClient } from '@/lib/api'
import { isUUID } from '@/hooks/useNegotiationStream'
import NegotiationView from '@/components/workspace/NegotiationView'
import WorkspaceView, { WorkspaceRightPanel } from '@/components/workspace/WorkspaceView'
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

  const [contract, setContract] = React.useState(null)
  // true while we wait for the API to tell us whether this UUID is still negotiating
  const [isCheckingStatus, setIsCheckingStatus] = React.useState(() => isUUID(id))
  // true when a UUID deep-link points to an already-finalized contract
  const [startInWorkspace, setStartInWorkspace] = React.useState(false)

  React.useEffect(() => {
    if (!isUUID(id)) return
    if (!isLoaded) return
    if (!isSignedIn) { setIsCheckingStatus(false); return }

    createApiClient(getToken).getContract(id)
      .then(c => {
        if (c.status !== 'negotiating') {
          setContract(c)
          setStartInWorkspace(true)
        }
        setIsCheckingStatus(false)
      })
      .catch(() => setIsCheckingStatus(false))
  }, [id, isLoaded, isSignedIn])

  if (isCheckingStatus) return <LoadingDots />

  // UUID deep-link to an already-finalized contract: go straight to WorkspaceView.
  if (startInWorkspace) return <WorkspaceView id={id} contract={contract} />

  // NegotiationView stays mounted for the life of the page; WorkspaceRightPanel
  // slides in alongside it when onFinalized fires. This avoids a component swap
  // that would trigger useMessages → fresh DB fetch → negotiation-era timestamps
  // and historical ThinkingBlocks bleeding into the workspace chat.
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
      <NegotiationView
        sessionId={id}
        onFinalized={c => setContract(c)}
        finalized={!!contract}
      />
      {contract && <WorkspaceRightPanel contract={contract} id={id} />}
    </div>
  )
}
