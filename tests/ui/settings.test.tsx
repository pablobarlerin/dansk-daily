import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import type { Progress } from '../../src/lib/progressTypes'
import { exportProgress, STORAGE_KEY } from '../../src/lib/store'
import { Settings } from '../../src/screens/Settings'
import {
  TODAY, fixedNow, fixtureContent, memoryStorage, placedProgress, storageWith, stored,
} from './fixtures'

const content = fixtureContent()

const nav = navigator as Navigator & Record<string, unknown>
const saved: Record<string, PropertyDescriptor | undefined> = {}
const navKeys = ['canShare', 'share', 'clipboard'] as const

beforeEach(() => {
  for (const k of navKeys) saved[k] = Object.getOwnPropertyDescriptor(nav, k)
})

afterEach(() => {
  cleanup()
  for (const k of navKeys) {
    const d = saved[k]
    if (d) Object.defineProperty(nav, k, d)
    else delete nav[k]
  }
})

function setNav(k: (typeof navKeys)[number], v: unknown) {
  Object.defineProperty(nav, k, { value: v, configurable: true, writable: true })
}

function renderApp(storage: Storage) {
  return render(<App content={content} storage={storage} now={fixedNow} />)
}

function openSettings(p: Progress = placedProgress({ contentVersion: content.version })) {
  const s = storageWith(p)
  renderApp(s)
  fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Settings' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy()
  return s
}

function pickFile(text: string, name = 'backup.json') {
  const input = screen.getByLabelText('Import backup') as HTMLInputElement
  const file = new File([text], name, { type: 'application/json' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

const backupOf = (p: Progress) => exportProgress(p, new Date('2026-10-03T09:00:00Z'))

describe('Settings: import', () => {
  it('an invalid file shows the error and keeps progress', async () => {
    const s = openSettings()
    const before = s.getItem(STORAGE_KEY)
    pickFile('{"hello": 1}')
    expect((await screen.findByRole('alert')).textContent).toMatch(/isn't a Dansk Daily backup/)
    expect(s.getItem(STORAGE_KEY)).toBe(before)
    expect(screen.queryByRole('button', { name: 'Replace' })).toBeNull()
  })

  it('a valid file asks with the export date; Cancel keeps progress', async () => {
    const s = openSettings()
    const before = s.getItem(STORAGE_KEY)
    pickFile(backupOf(placedProgress({ lessonsDone: { 'u01-l01': true } })))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog.textContent).toMatch(
      /Replace your current progress with the backup from 3 October 2026\?/,
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(s.getItem(STORAGE_KEY)).toBe(before)
  })

  it('Replace stashes the current progress, then loads the backup', async () => {
    const s = openSettings()
    const before = s.getItem(STORAGE_KEY)
    pickFile(backupOf(placedProgress({ lessonsDone: { 'u01-l01': true } })))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Replace' }))
    expect(s.getItem(`dansk-daily:progress-before-replace-${TODAY}`)).toBe(before)
    expect(stored(s).lessonsDone).toEqual({ 'u01-l01': true })
    expect(stored(s).contentVersion).toBe(content.version)
  })

  it('after Replace the app follows the loaded backup (not placed yet → Welcome)', async () => {
    openSettings()
    const { emptyProgress } = await import('../../src/lib/store')
    pickFile(backupOf(emptyProgress(TODAY)))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Replace' }))
    expect(screen.getByRole('button', { name: /find my level/i })).toBeTruthy()
  })

  it('if the safe copy cannot be written, nothing is replaced and a message shows', async () => {
    const base = storageWith(placedProgress({ contentVersion: content.version }))
    const s: Storage = {

      get length() { return base.length },
      getItem: base.getItem,
      key: base.key,
      removeItem: base.removeItem,
      clear: base.clear,
      setItem: (k: string, v: string) => {
        if (k.startsWith('dansk-daily:progress-before-')) throw new DOMException('Quota', 'QuotaExceededError')
        base.setItem(k, v)
      },
    }
    renderApp(s)
    fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Settings' }))
    const before = s.getItem(STORAGE_KEY)
    pickFile(backupOf(placedProgress({ lessonsDone: { 'u01-l01': true } })))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Replace' }))
    expect(screen.getByRole('alert').textContent).toMatch(/couldn't keep a safe copy/i)
    expect(s.getItem(STORAGE_KEY)).toBe(before)
  })
})

describe('Settings: reset', () => {
  it('asks first; Reset stashes the current progress and starts over', () => {
    const s = openSettings(placedProgress({ contentVersion: content.version, lessonsDone: { 'u01-l01': true } }))
    const before = s.getItem(STORAGE_KEY)
    fireEvent.click(screen.getByRole('button', { name: 'Reset all progress' }))
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(s.getItem(STORAGE_KEY)).toBe(before)
    fireEvent.click(screen.getByRole('button', { name: 'Reset all progress' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reset' }))
    expect(s.getItem(`dansk-daily:progress-before-reset-${TODAY}`)).toBe(before)
    expect(stored(s).lessonsDone).toEqual({})
    expect(stored(s).placement.done).toBe(false)
    expect(screen.getByRole('button', { name: /find my level/i })).toBeTruthy()
  })

  it('if the safe copy cannot be written, nothing is reset', () => {
    const base = storageWith(placedProgress({ contentVersion: content.version, lessonsDone: { 'u01-l01': true } }))
    const s: Storage = {
      get length() { return base.length },
      getItem: base.getItem,
      key: base.key,
      removeItem: base.removeItem,
      clear: base.clear,
      setItem: (k: string, v: string) => {
        if (k.startsWith('dansk-daily:progress-before-')) throw new DOMException('Quota', 'QuotaExceededError')
        base.setItem(k, v)
      },
    }
    renderApp(s)
    fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset all progress' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reset' }))
    expect(screen.getByRole('alert').textContent).toMatch(/couldn't keep a safe copy/i)
    expect(stored(s).lessonsDone).toEqual({ 'u01-l01': true })
  })
})

describe('Settings: export', () => {
  it('shares one .json file when the share sheet can take files', async () => {
    const share = vi.fn(() => Promise.resolve())
    setNav('canShare', vi.fn(() => true))
    setNav('share', share)
    const s = openSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Export backup' }))
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    const files = (share.mock.calls[0] as unknown as [{ files: File[] }])[0].files
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe(`dansk-daily-backup-${TODAY}.json`)
    expect(JSON.parse(await files[0].text()).app).toBe('dansk-daily')
    expect(stored(s).lastBackupNudge).toBe(TODAY)
  })

  it('without canShare falls back to a download link', async () => {
    setNav('canShare', undefined)
    const s = openSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Export backup' }))
    const link = (await screen.findByRole('link', { name: /save backup file/i })) as HTMLAnchorElement
    expect(link.getAttribute('download')).toBe(`dansk-daily-backup-${TODAY}.json`)
    expect(link.getAttribute('href')).toBeTruthy()
    expect(stored(s).lastBackupNudge).toBe(TODAY)
  })
})

describe('Settings: practice options', () => {
  it('new words per day cannot go below 3', () => {
    const p = placedProgress({ contentVersion: content.version })
    const s = openSettings({ ...p, settings: { ...p.settings, newPerDay: 4 } })
    const less = screen.getByRole('button', { name: 'Fewer new words' })
    fireEvent.click(less)
    expect(stored(s).settings.newPerDay).toBe(3)
    expect((less as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(less)
    expect(stored(s).settings.newPerDay).toBe(3)
    fireEvent.click(screen.getByRole('button', { name: 'More new words' }))
    expect(stored(s).settings.newPerDay).toBe(4)
  })

  it('audio and backup reminder switches save immediately', () => {
    const s = openSettings()
    const audio = screen.getByRole('switch', { name: 'Audio' })
    expect(audio.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(audio)
    expect(stored(s).settings.audio).toBe(false)
    fireEvent.click(screen.getByRole('switch', { name: 'Monthly backup reminder' }))
    expect(stored(s).settings.backupNudge).toBe(false)
  })

  it('speed stays within 0.7–1.2', () => {
    const s = openSettings()
    const slower = screen.getByRole('button', { name: 'Slower' })
    for (let i = 0; i < 6; i++) fireEvent.click(slower)
    expect(stored(s).settings.speed).toBe(0.7)
    const faster = screen.getByRole('button', { name: 'Faster' })
    for (let i = 0; i < 9; i++) fireEvent.click(faster)
    expect(stored(s).settings.speed).toBe(1.2)
  })

  it('a failing save shows a readable message', () => {
    const p = placedProgress({ contentVersion: content.version })
    const s = memoryStorage({ [STORAGE_KEY]: JSON.stringify(p) }, { failSet: true })
    renderApp(s)
    fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Audio' }))
    expect(screen.getByRole('alert').textContent).toMatch(/couldn't save/i)
  })

  it('shows "Audio saved for offline: N of M"', () => {
    const p = placedProgress({ contentVersion: content.version })
    render(
      <Settings
        content={content}
        p={p}
        today={TODAY}
        now={fixedNow}
        update={() => {}}
        replace={() => null}
        audio={{ done: 1412, total: 1412 }}
        onReplaced={() => {}}
        onReset={() => {}}
      />,
    )
    expect(screen.getByTestId('audio-saved').textContent).toBe('Audio saved for offline: 1,412 of 1,412')
  })
})

describe('Settings: copy reports', () => {
  it('works with no reports and ends with the current lesson', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    setNav('clipboard', { writeText })
    openSettings()
    fireEvent.click(screen.getByRole('button', { name: /copy reports/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const text = (writeText.mock.calls[0] as unknown as [string])[0]
    expect(text.split('\n').at(-1)).toBe('Current lesson: u01-l01')
    expect(await screen.findByText(/copied/i)).toBeTruthy()
  })
})

describe('tab bar', () => {
  it('Learn / Units / Settings on Home; hidden during a session', () => {
    renderApp(storageWith(placedProgress({ contentVersion: content.version })))
    const tabs = within(screen.getByRole('navigation'))
    expect(tabs.getByRole('button', { name: 'Learn' }).getAttribute('aria-current')).toBe('page')
    fireEvent.click(screen.getByRole('button', { name: /start today's session/i }))
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('Units lists the units and opens one; back returns to the list', () => {
    renderApp(storageWith(placedProgress({ contentVersion: content.version })))
    fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Units' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Units' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'I klassen 1' }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/I klassen 1/)
    fireEvent.click(document.querySelector('button.back')!)
    expect(screen.getByRole('heading', { level: 1, name: 'Units' })).toBeTruthy()
  })

  it('hidden on Welcome', () => {
    renderApp(memoryStorage())
    expect(screen.queryByRole('navigation')).toBeNull()
  })
})

describe('Home backup nudge', () => {
  it('"Back up" runs the export and records lastBackupNudge', async () => {
    const share = vi.fn(() => Promise.resolve())
    setNav('canShare', vi.fn(() => true))
    setNav('share', share)
    const s = storageWith(placedProgress({ contentVersion: content.version, firstUse: '2026-10-01' }))
    renderApp(s)
    fireEvent.click(screen.getByRole('button', { name: 'Back up' }))
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    expect(stored(s).lastBackupNudge).toBe(TODAY)
  })
})
