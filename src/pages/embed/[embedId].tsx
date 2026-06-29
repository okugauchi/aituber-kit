import { useRouter } from 'next/router'

import { EmbedApp } from '@/components/embed/EmbedApp'

export default function EmbedIdPage() {
  const router = useRouter()
  const embedId =
    typeof router.query.embedId === 'string' ? router.query.embedId : undefined

  return <EmbedApp embedId={embedId} />
}
