import { useState } from 'preact/hooks'
import { Question } from './shared'
import type { ExerciseProps } from './types'

type Side = 'da' | 'en'

function shuffledIndexes(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Match pairs. Graded per pair: a pair tapped wrong at least once is "missed" (both pairs
 * involved). The exercise is correct only when no pair was missed; when it is wrong, only the
 * missed pairs' items are graded wrong (`missedIds`), the others right.
 */
export function Match({ exercise, onAnswer, locked }: ExerciseProps) {
  const pairs = exercise.pairs ?? []
  const [order] = useState(() => ({ da: shuffledIndexes(pairs.length), en: shuffledIndexes(pairs.length) }))
  const [sel, setSel] = useState<{ side: Side; i: number } | null>(null)
  const [matched, setMatched] = useState<Set<number>>(new Set())
  const [missed, setMissed] = useState<Set<number>>(new Set())
  const [flash, setFlash] = useState<{ da: number; en: number } | null>(null)

  const tap = (side: Side, i: number) => {
    if (locked || matched.has(i)) return
    setFlash(null)
    if (!sel || sel.side === side) {
      setSel({ side, i })
      return
    }
    const da = side === 'da' ? i : sel.i
    const en = side === 'en' ? i : sel.i
    setSel(null)
    if (da === en) {
      const next = new Set(matched).add(da)
      setMatched(next)
      if (next.size === pairs.length) {
        const ks = [...missed].sort((a, b) => a - b)
        onAnswer({
          verdict: ks.length ? 'wrong' : 'correct',
          expected: '',
          graded: [...exercise.itemIds],
          missed: ks.map(k => pairs[k]),
          missedIds: ks.map(k => exercise.itemIds[k]),
        })
      }
    } else {
      setMissed(new Set(missed).add(da).add(en))
      setFlash({ da, en })
    }
  }

  const column = (side: Side) => (
    <div class="match-col" data-testid={`match-${side}`}>
      {order[side].map(i => {
        const done = matched.has(i)
        const on = sel?.side === side && sel.i === i
        const bad = flash?.[side] === i
        return (
          <button
            type="button"
            key={i}
            class={`choice${done ? ' is-right' : ''}${on ? ' is-on' : ''}${bad ? ' is-wrong' : ''}`}
            lang={side === 'da' ? 'da' : undefined}
            disabled={locked || done}
            aria-pressed={on}
            onClick={() => tap(side, i)}
          >
            {pairs[i][side]}
          </button>
        )
      })}
    </div>
  )

  return (
    <>
      <Question title={exercise.prompt} />
      <div class="match">
        {column('da')}
        {column('en')}
      </div>
    </>
  )
}
