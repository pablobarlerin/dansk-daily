import type { Content, Item } from '../content/types'
import type { Verdict } from './answers'
import { makeExercise, type Exercise, type ExerciseKind } from './exercises'
import type { Rng } from './rng'
import { levelFor, review, type ItemState, type Level } from './srs'

export interface RunnerOpts {
  canPlay: (da: string) => boolean
  mode: 'scheduled' | 'off-schedule'
  pool: Item[]
  level?: Level
}

export class SessionRunner {
  private states: Record<string, ItemState>
  private queue: string[]
  private items = new Map<string, Item>()
  private cache: { id: string; ex: Exercise } | null = null
  private lastKind: ExerciseKind | undefined
  private wrong = new Set<string>()
  private firstWrongBefore = new Map<string, ItemState>()
  private lastBefore = new Map<string, ItemState>()

  constructor(
    c: Content,
    states: Record<string, ItemState>,
    itemIds: string[],
    private rng: Rng,
    private opts: RunnerOpts,
  ) {
    for (const u of c.units) for (const l of u.lessons) for (const i of l.items) this.items.set(i.id, i)
    for (const id of itemIds) {
      if (!states[id]) throw new Error(`No state for item ${id}`)
      if (!this.items.has(id)) throw new Error(`Unknown item ${id}`)
    }
    this.states = { ...states }
    this.queue = [...itemIds]
  }

  current(): Exercise | null {
    const id = this.queue[0]
    if (id === undefined) return null
    if (this.cache && this.cache.id === id) return this.cache.ex
    const level = this.opts.level ?? levelFor(this.states[id].strength)
    const ex = makeExercise(this.items.get(id)!, level, this.opts.pool, this.rng, {
      canPlay: this.opts.canPlay,
      lastKind: this.lastKind,
    })
    this.cache = { id, ex }
    return ex
  }

  answer(verdict: Verdict, today: string): { states: Record<string, ItemState> } {
    const ex = this.current()
    if (!ex) return { states: { ...this.states } }
    const head = this.queue.shift()!
    const graded = [head]
    if (ex.kind === 'match') {
      for (const id of ex.itemIds) {
        if (id === head) continue
        const at = this.queue.indexOf(id)
        if (at >= 0) { this.queue.splice(at, 1); graded.push(id) }
      }
    }
    this.lastKind = ex.kind
    this.cache = null
    const requeue: string[] = []
    for (const id of graded) {
      const before = this.states[id]
      this.lastBefore.set(id, before)
      let next = before
      if (verdict === 'wrong') {
        if (this.wrong.has(id)) {
          next = { ...before, seen: before.seen + 1 }
        } else {
          this.firstWrongBefore.set(id, before)
          this.wrong.add(id)
          next = review(before, 'wrong', today)
        }
        requeue.push(id)
      } else if (this.wrong.has(id)) {
        next = { ...before, known: true, seen: before.seen + 1 }
      } else if (this.opts.mode === 'scheduled') {
        next = review(before, verdict, today)
      }
      this.states[id] = next
    }
    requeue.forEach((id, k) => this.queue.splice(Math.min(3 + k, this.queue.length), 0, id))
    return { states: { ...this.states } }
  }

  drop(itemId: string): void {
    this.removePending(itemId)
  }

  undoLast(itemId: string): { states: Record<string, ItemState> } {
    const prev = this.firstWrongBefore.get(itemId) ?? this.lastBefore.get(itemId)
    if (prev) this.states[itemId] = prev
    this.wrong.delete(itemId)
    this.firstWrongBefore.delete(itemId)
    this.lastBefore.delete(itemId)
    this.removePending(itemId)
    return { states: { ...this.states } }
  }

  remaining(): number {
    return this.queue.length
  }

  /** A dropped (reported) id leaves the queue and the pool, so it is never a distractor or match pair again. */
  private removePending(itemId: string): void {
    this.queue = this.queue.filter((id) => id !== itemId)
    this.opts = { ...this.opts, pool: this.opts.pool.filter((i) => i.id !== itemId) }
    if (this.cache && (this.cache.id !== this.queue[0] || this.cache.ex.itemIds.includes(itemId))) this.cache = null
  }
}
