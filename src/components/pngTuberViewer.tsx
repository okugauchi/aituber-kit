'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import ModelLoadingOverlay from '@/components/modelLoadingOverlay'
import ErrorBoundary from '@/components/common/ErrorBoundary'

const PNGTuberComponent = dynamic(() => import('./PNGTuberComponent'), {
  ssr: false,
  loading: () => <ModelLoadingOverlay />,
})

function PNGTuberViewerInner() {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    return <ModelLoadingOverlay />
  }

  return (
    <div className="fixed inset-0 w-screen h-screen z-10">
      <PNGTuberComponent />
    </div>
  )
}

export default function PNGTuberViewer() {
  return (
    <ErrorBoundary name="pngtuber-viewer">
      <PNGTuberViewerInner />
    </ErrorBoundary>
  )
}
