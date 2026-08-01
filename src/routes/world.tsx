import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { PixelWorld } from '@/components/mission-control/pixel-world'

export const Route = createFileRoute('/world')({
  ssr: false,
  component: WorldRoute,
})

function WorldRoute() {
  usePageTitle('Pixel World — Swarm Town')
  return <PixelWorld />
}
