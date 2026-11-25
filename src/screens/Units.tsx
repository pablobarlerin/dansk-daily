import type { Content } from '../content/types'
import type { Progress } from '../lib/progressTypes'
import { UnitList } from './Home'

/** The Units tab: the unit list on its own; each card opens the unit. */
export function Units({ content, p, onOpenUnit }: { content: Content; p: Progress; onOpenUnit: (unitId: string) => void }) {
  return (
    <main class="screen units-screen">
      <h1 class="set-h">Units</h1>
      <UnitList content={content} p={p} onOpenUnit={onOpenUnit} />
    </main>
  )
}
