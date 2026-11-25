import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact'
import { useRef, useState } from 'preact/hooks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExerciseStep } from '../../src/components/ExerciseStep'
import type { AnswerResult } from '../../src/components/exercises/types'
import { initAudio } from '../../src/lib/audio'
import type { Exercise } from '../../src/lib/exercises'
import { allItems } from '../../src/lib/path'
import type { Progress } from '../../src/lib/progressTypes'
import { seeded } from '../../src/lib/rng'
import { SessionRunner } from '../../src/lib/sessionRunner'
import type { ItemState } from '../../src/lib/srs'
import { playable } from '../../src/components/exercises/shared'
import { gradedIds, reportTargets, reportWithRunner } from '../../src/state/reporting'
import { TODAY, fixtureContent, placedProgress } from './fixtures'

afterEach(() => {
  cleanup()
  initAudio({}, false)
})

const c = fixtureContent()

const typeBil: Exercise = {
  kind: 'type-da', itemIds: ['u01-p09-bil'], prompt: 'Type in Danish: a car', accepted: ['en bil'], gender: 'en',
}
const typeHus: Exercise = {
  kind: 'type-da', itemIds: ['u01-p10-hus'], prompt: 'Type in Danish: a house', accepted: ['et hus'], gender: 'et',
}

function renderStep(exercise: Exercise, extra: Partial<Parameters<typeof ExerciseStep>[0]> = {}) {
  const onAnswer = vi.fn<(r: AnswerResult) => void>()
  render(
    <ExerciseStep
      exercise={exercise}
      canPlay={() => false}
      speed={1}
      reportTargets={reportTargets(c, exercise)}
      onAnswer={onAnswer}
      onReport={vi.fn()}
      onContinue={vi.fn()}
      {...extra}
    />,
  )
  return { onAnswer }
}

const answerBox = () => screen.getByRole('textbox', { name: /your answer/i }) as HTMLInputElement

function typeAndCheck(text: string) {
  fireEvent.input(answerBox(), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Check' }))
}

describe('typed answers', () => {
  it('the text input has autocapitalize off and the other typing attributes', () => {
    renderStep(typeBil)
    const box = answerBox()
    expect(box.getAttribute('autocapitalize')).toBe('off')
    expect(box.getAttribute('autocorrect')).toBe('off')
    expect(box.getAttribute('spellcheck')).toBe('false')
    expect(box.getAttribute('lang')).toBe('da')
  })

  it('tapping ø inserts ø at the cursor', () => {
    renderStep(typeBil)
    const box = answerBox()
    fireEvent.input(box, { target: { value: 'sster' } })
    box.setSelectionRange(1, 1)
    fireEvent.click(screen.getByRole('button', { name: 'Type ø' }))
    expect(box.value).toBe('søster')
    expect(box.selectionStart).toBe(2)
    expect(screen.getByRole('button', { name: 'Type æ' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Type å' })).toBeTruthy()
  })

  it('answering wrong shows the right answer', () => {
    const { onAnswer } = renderStep({ ...typeBil, itemIds: ['u01-p09-hej'], prompt: 'Type in Danish: hello', accepted: ['hej'], gender: undefined })
    typeAndCheck('nej')
    const sheet = screen.getByRole('region', { name: /feedback/i })
    expect(sheet.textContent).toMatch(/Not quite/)
    expect(sheet.textContent).toMatch(/Correct answer: hej/)
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'wrong', graded: ['u01-p09-hej'] }))
  })

  it('a wrong answer shows the item note', () => {
    renderStep(typeBil, { note: 'A car is en bil.' })
    typeAndCheck('xyz')
    expect(screen.getByRole('region', { name: /feedback/i }).textContent).toMatch(/A car is en bil\./)
  })

  it('typing "bil" for "en bil" shows "Remember: en bil" with en in bold', () => {
    renderStep(typeBil)
    typeAndCheck('bil')
    const hint = screen.getByText((_, el) => el?.classList.contains('hint') ?? false)
    expect(hint.textContent).toMatch(/^Remember: en bil/)
    expect(hint.querySelector('b')?.textContent).toBe('en')
  })

  it('"en hus" for "et hus" shows "Remember: et hus"', () => {
    renderStep(typeHus)
    typeAndCheck('en hus')
    const hint = screen.getByText((_, el) => el?.classList.contains('hint') ?? false)
    expect(hint.textContent).toMatch(/^Remember: et hus/)
    expect(hint.querySelector('b')?.textContent).toBe('et')
  })

  it('a missing ø is almost and shows the correct spelling', () => {
    renderStep({ kind: 'type-da', itemIds: ['u01-p09-hej'], prompt: 'Type in Danish: sister', accepted: ['en søster'] })
    typeAndCheck('en soster')
    const sheet = screen.getByRole('region', { name: /feedback/i })
    expect(sheet.textContent).toMatch(/Almost/)
    expect(sheet.textContent).toMatch(/en søster/)
  })

  it('a prompt with a line break keeps both lines (pre-line)', () => {
    renderStep({ kind: 'type-gap', itemIds: ['u01-p09-bil'], prompt: 'Fill the gap: Jeg har en ___.\nI have a car.', accepted: ['bil'] })
    const bubble = screen.getByTestId('prompt')
    expect(bubble.textContent).toBe('Jeg har en ___.\nI have a car.')
    expect(bubble.classList.contains('pre-line')).toBe(true)
  })
})

describe('audio', () => {
  const listen: Exercise = {
    kind: 'listen-type', itemIds: ['u01-p09-hej'], prompt: 'Type what you hear', speak: 'hej', accepted: ['hej'],
  }

  it('with settings.audio off, no speaker button', () => {
    initAudio({}, true)
    const settings = placedProgress().settings
    renderStep(listen, { canPlay: playable({ ...settings, audio: false }) })
    expect(screen.queryByRole('button', { name: /play/i })).toBeNull()
  })

  it('with settings.audio on and a voice, there is a speaker button', () => {
    initAudio({}, true)
    const settings = placedProgress().settings
    renderStep(listen, { canPlay: playable({ ...settings, audio: true }) })
    expect(screen.getByRole('button', { name: /play/i })).toBeTruthy()
  })
})

describe('choices, tiles and match', () => {
  it('a wrong multiple-choice pick shows the right answer', () => {
    const { onAnswer } = renderStep({
      kind: 'mc-da-en', itemIds: ['u01-p09-hej'], prompt: 'What does "hej" mean?',
      options: ['goodbye', 'hello', 'yes', 'a car'], accepted: ['hello'],
    })
    fireEvent.click(screen.getByRole('button', { name: 'goodbye' }))
    expect(screen.getByRole('region', { name: /feedback/i }).textContent).toMatch(/Correct answer: hello/)
    expect(onAnswer.mock.calls[0][0].verdict).toBe('wrong')
  })

  it('a multiple-choice option that folds to the answer (bor for bør) is wrong, never almost', () => {
    const { onAnswer } = renderStep({
      kind: 'mc-en-da', itemIds: ['u01-p09-hej'], prompt: 'Which is "should"?',
      options: ['bor', 'bør', 'ja', 'hej'], accepted: ['bør'],
    })
    fireEvent.click(screen.getByRole('button', { name: 'bor' }))
    expect(onAnswer.mock.calls[0][0].verdict).toBe('wrong')
    expect(screen.getByRole('region', { name: /feedback/i }).textContent).toMatch(/Correct answer: bør/)
  })

  it('the right multiple-choice option is correct', () => {
    const { onAnswer } = renderStep({
      kind: 'mc-en-da', itemIds: ['u01-p09-hej'], prompt: 'Which is "should"?',
      options: ['bor', 'bør', 'ja', 'hej'], accepted: ['bør'],
    })
    fireEvent.click(screen.getByRole('button', { name: 'bør' }))
    expect(onAnswer.mock.calls[0][0]).toMatchObject({ verdict: 'correct', expected: 'bør' })
  })

  it('tiles: building the sentence and checking is correct', () => {
    const { onAnswer } = renderStep({
      kind: 'tiles', itemIds: ['u01-p09-bil'], prompt: 'Build the sentence: I have a car.',
      tiles: ['bil', 'Jeg', 'hus', 'har', 'en'], accepted: ['Jeg har en bil'],
    })
    const bank = screen.getByTestId('tile-bank')
    for (const w of ['Jeg', 'har', 'en', 'bil']) fireEvent.click(within(bank).getByRole('button', { name: w }))
    fireEvent.click(screen.getByRole('button', { name: 'Check' }))
    expect(onAnswer.mock.calls[0][0].verdict).toBe('correct')
  })

  const matchEx: Exercise = {
    kind: 'match', itemIds: ['u01-p09-hej', 'u01-p09-farvel', 'u01-p10-ja'], prompt: 'Match the Danish with the English',
    pairs: [{ da: 'hej', en: 'hello' }, { da: 'farvel', en: 'goodbye' }, { da: 'ja', en: 'yes' }], accepted: [],
  }
  const tapPair = (da: string, en: string) => {
    fireEvent.click(within(screen.getByTestId('match-da')).getByRole('button', { name: da }))
    fireEvent.click(within(screen.getByTestId('match-en')).getByRole('button', { name: en }))
  }

  it('match is graded per pair: all pairs right first time is correct', () => {
    const { onAnswer } = renderStep(matchEx)
    tapPair('hej', 'hello')
    tapPair('farvel', 'goodbye')
    expect(onAnswer).not.toHaveBeenCalled()
    tapPair('ja', 'yes')
    expect(onAnswer.mock.calls[0][0]).toMatchObject({ verdict: 'correct', graded: matchEx.itemIds })
  })

  it('match: a wrong pair makes it wrong and the sheet lists the missed pair', () => {
    const { onAnswer } = renderStep(matchEx)
    tapPair('hej', 'goodbye')
    tapPair('hej', 'hello')
    tapPair('farvel', 'goodbye')
    tapPair('ja', 'yes')
    expect(onAnswer.mock.calls[0][0].verdict).toBe('wrong')
    expect(screen.getByRole('region', { name: /feedback/i }).textContent).toMatch(/hej = hello/)
  })

  it('match: only the pairs actually missed are reported as missed ids', () => {
    const { onAnswer } = renderStep(matchEx)
    tapPair('hej', 'goodbye')
    tapPair('hej', 'hello')
    tapPair('farvel', 'goodbye')
    tapPair('ja', 'yes')
    expect(onAnswer.mock.calls[0][0].missedIds).toEqual(['u01-p09-hej', 'u01-p09-farvel'])
  })
})

describe('reports', () => {
  it('a generated item reports the value shown', () => {
    const ex: Exercise = {
      kind: 'type-da', itemIds: ['u01-p09-hej'], prompt: 'Type in Danish: 3:15', accepted: ['kvart over tre'],
      shown: { da: 'kvart over tre', en: '3:15' },
    }
    expect(reportTargets(c, ex)).toEqual([{ id: 'u01-p09-hej', da: 'kvart over tre', en: '3:15' }])
  })

  it('a match offers each pair as a report target', () => {
    const ex: Exercise = {
      kind: 'match', itemIds: ['u01-p09-hej', 'u01-p09-farvel'], prompt: 'Match', accepted: [],
      pairs: [{ da: 'hej', en: 'hello' }, { da: 'farvel', en: 'goodbye' }],
    }
    expect(reportTargets(c, ex).map(t => t.id)).toEqual(['u01-p09-hej', 'u01-p09-farvel'])
  })

  /** Minimal runner-driven session (Task 21 builds the real one). */
  function Harness({ initial, seen, onSave }: { initial: Progress; seen: string[]; onSave: (p: Progress) => void }) {
    const ids = ['u01-p09-bil', 'u01-p09-hej']
    const [runner] = useState(
      () => new SessionRunner(c, initial.states, ids, seeded(7), { canPlay: () => false, mode: 'scheduled', pool: allItems(c) }),
    )
    const pRef = useRef(initial)
    const graded = useRef<string[]>([])
    // The shown exercise is held until Continue, so a report mid-feedback doesn't swap it.
    const [{ step, ex }, setCur] = useState(() => ({ step: 0, ex: runner.current() }))
    const save = (p: Progress) => { pRef.current = p; onSave(p) }
    if (!ex) return <p>All done</p>
    if (seen[seen.length - 1] !== `${step}:${ex.itemIds[0]}`) seen.push(`${step}:${ex.itemIds[0]}`)
    return (
      <ExerciseStep
        key={step}
        exercise={ex}
        canPlay={() => false}
        speed={1}
        reportTargets={reportTargets(c, ex)}
        onAnswer={r => {
          const before = pRef.current.states
          const after = runner.answer(r.verdict, TODAY).states
          graded.current = gradedIds(ex, before, after)
          save({ ...pRef.current, states: { ...pRef.current.states, ...after } })
        }}
        onReport={(target, note, r) => {
          save(reportWithRunner(pRef.current, c, runner, {
            target, note, today: TODAY, undo: r.verdict === 'wrong' ? graded.current : [],
          }))
        }}
        onContinue={() => setCur({ step: step + 1, ex: runner.current() })}
      />
    )
  }

  it('⚑ Report on a wrong answer saves a report, restores the previous strength, and the item does not come back', () => {
    const strong: ItemState = { strength: 5, due: '2026-12-20', lapses: 0, seen: 4, known: true }
    const initial = placedProgress({ states: { 'u01-p09-bil': strong, 'u01-p09-hej': { ...strong, due: TODAY } } })
    const seen: string[] = []
    let saved = initial
    render(<Harness initial={initial} seen={seen} onSave={p => { saved = p }} />)

    expect(screen.getByTestId('exercise').getAttribute('data-items')).toBe('u01-p09-bil')
    typeAndCheck('xyz')
    expect(saved.states['u01-p09-bil'].strength).toBeLessThan(5)

    fireEvent.click(screen.getByRole('button', { name: /report a problem/i }))
    const dialog = screen.getByRole('dialog', { name: /report/i })
    fireEvent.click(within(dialog).getByRole('radio', { name: 'wrong translation' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }))

    expect(saved.reports).toHaveLength(1)
    expect(saved.reports[0]).toMatchObject({
      itemId: 'u01-p09-bil', unitId: 'u01', da: 'en bil', en: 'a car', note: 'wrong translation', day: TODAY,
      itemHash: c.hashes['u01-p09-bil'],
    })
    expect(saved.states['u01-p09-bil']).toEqual(strong)

    fireEvent.click(screen.getByRole('button', { name: /got it|continue/i }))
    expect(screen.getByTestId('exercise').getAttribute('data-items')).toBe('u01-p09-hej')
    typeAndCheck('hej')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByText('All done')).toBeTruthy()
    expect(seen.filter(s => s.endsWith('u01-p09-bil'))).toHaveLength(1)
  })

  it('the report sheet accepts free text', () => {
    const onReport = vi.fn()
    renderStep(typeBil, { onReport })
    typeAndCheck('en bil')
    fireEvent.click(screen.getByRole('button', { name: /report a problem/i }))
    const dialog = screen.getByRole('dialog', { name: /report/i })
    fireEvent.input(within(dialog).getByRole('textbox'), { target: { value: 'audio cuts off' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }))
    expect(onReport).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u01-p09-bil' }), 'audio cuts off', expect.objectContaining({ verdict: 'correct' }),
    )
    expect(screen.queryByRole('button', { name: /report a problem/i })).toBeNull()
  })
})
