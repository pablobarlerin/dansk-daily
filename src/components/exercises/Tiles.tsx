import { useState } from 'preact/hooks'
import { grade, Question, splitPrompt } from './shared'
import type { ExerciseProps } from './types'

/** Build the sentence (or a number/time) from word tiles. */
export function Tiles({ exercise, onAnswer, locked }: ExerciseProps) {
  const tiles = exercise.tiles ?? []
  const [placed, setPlaced] = useState<number[]>([])
  const [title, bubble] = splitPrompt(exercise.prompt)
  const used = new Set(placed)
  const check = () => {
    if (locked || placed.length === 0) return
    onAnswer(grade(placed.map(i => tiles[i]).join(' '), exercise))
  }
  return (
    <>
      <Question title={title ?? exercise.prompt} bubble={title ? bubble : undefined} />
      <div class="answer-line" data-testid="tile-answer" aria-label="Your sentence">
        {placed.map(i => (
          <button
            type="button"
            key={i}
            class="tile"
            lang="da"
            disabled={locked}
            onClick={() => setPlaced(placed.filter(j => j !== i))}
          >
            {tiles[i]}
          </button>
        ))}
      </div>
      <div class="bank" data-testid="tile-bank">
        {tiles.map((t, i) =>
          used.has(i) ? (
            <span key={i} class="tile used" aria-hidden="true">
              {t}
            </span>
          ) : (
            <button type="button" key={i} class="tile" lang="da" disabled={locked} onClick={() => setPlaced([...placed, i])}>
              {t}
            </button>
          ),
        )}
      </div>
      <div class="ex-actions">
        <button type="button" class="btn btn-primary" disabled={locked || placed.length === 0} onClick={check}>
          Check
        </button>
      </div>
    </>
  )
}
