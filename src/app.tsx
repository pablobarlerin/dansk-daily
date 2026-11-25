import { useEffect, useState } from 'preact/hooks'
import manifest from './content/audio-manifest.json'
import { loadContent } from './content/load'
import type { Content } from './content/types'
import { downloadAllAudio, initAudio, speechAvailable } from './lib/audio'
import { TabBar, type Tab } from './components/TabBar'
import { Checkpoint } from './screens/Checkpoint'
import { Home } from './screens/Home'
import { Placement } from './screens/Placement'
import { Session } from './screens/Session'
import { Settings, type AudioStatus } from './screens/Settings'
import { UnitDetail } from './screens/UnitDetail'
import { Units } from './screens/Units'
import { Welcome } from './screens/Welcome'
import { useProgress } from './state/useProgress'

type Screen =
  | { t: 'welcome' }
  | { t: 'home' }
  | { t: 'placement' }
  | { t: 'session' }
  | { t: 'units' }
  | { t: 'settings' }
  /** `fromList`: opened from the Units tab, so Back returns there. */
  | { t: 'unit'; unitId: string; fromList?: boolean }
  /** "Start this lesson" from a unit: a Session over one lesson, back to the unit at the end. */
  | { t: 'lesson'; unitId: string; lessonId: string }
  | { t: 'checkpoint'; unitId: string }

interface Props {
  /** Injected in tests; defaults to the real units. */
  content?: Content
  /** Injected in tests; defaults to localStorage. */
  storage?: Storage
  /** Injected in tests; defaults to the real clock. */
  now?: () => Date
}

let realContent: Content | null = null
const defaultContent = () => (realContent ??= loadContent())
const realNow = () => new Date()

export type { AudioStatus }

/** Audio files in the manifest (its keys starting with '_' are metadata). */
const AUDIO_TOTAL = Object.keys(manifest).filter(k => !k.startsWith('_')).length

/** Background start-up: keep storage, set up audio, cache all clips when online. Never throws. */
function startBackground(onAudio: (s: AudioStatus) => void): void {
  try {
    void navigator.storage?.persist?.().catch(() => {})
  } catch {
    // not available
  }
  const m = manifest as Record<string, string>
  initAudio(m, false)
  void speechAvailable()
    .then(hasVoice => {
      initAudio(m, hasVoice)
      if (navigator.onLine !== false) {
        // Report every 50 files (and the last) so start-up doesn't re-render 2000+ times.
        return downloadAllAudio(m, (done, total) => {
          if (done % 50 === 0 || done === total) onAudio({ done, total })
        })
      }
    })
    .catch(() => {})
}

export function App({ content: injected, storage, now = realNow }: Props = {}) {
  const [content] = useState(() => injected ?? defaultContent())
  const [store] = useState(() => storage ?? localStorage)
  const api = useProgress(content, store, now)
  const [screen, setScreen] = useState<Screen>(() => ({
    t: api.p.placement.done ? 'home' : api.p.placement.inProgress ? 'placement' : 'welcome',
  }))
  const go = (t: 'welcome' | 'home' | 'placement' | 'session' | 'units' | 'settings') => setScreen({ t })
  const [audio, setAudio] = useState<AudioStatus>({ done: 0, total: AUDIO_TOTAL })

  useEffect(() => startBackground(setAudio), [])

  useEffect(() => {
    if (!api.newContent) return
    const t = setTimeout(api.dismissNewContent, 5000)
    return () => clearTimeout(t)
  }, [api.newContent])

  const skipPlacement = () => {
    api.update(p => ({ ...p, placement: { done: true, startUnitId: null }, states: {} }))
    go('home')
  }

  let body
  const home = () => (
    <Home
      content={content}
      p={api.p}
      today={api.today}
      update={api.update}
      now={now}
      onStartSession={() => go('session')}
      onOpenUnit={unitId => setScreen({ t: 'unit', unitId })}
    />
  )

  const unit = 'unitId' in screen ? content.units.find(u => u.id === screen.unitId) : undefined
  switch (screen.t) {
    case 'welcome':
      body = <Welcome onPlacement={() => go('placement')} onSkip={skipPlacement} />
      break
    case 'placement':
      body = (
        <Placement
          content={content}
          p={api.p}
          today={api.today}
          update={api.update}
          onDone={() => go('home')}
          onExit={() => go('welcome')}
        />
      )
      break
    case 'session':
      body = (
        <Session
          content={content}
          p={api.p}
          today={api.today}
          update={api.update}
          activity={api.activity}
          onExit={() => go('home')}
        />
      )
      break
    case 'unit':
    case 'lesson':
    case 'checkpoint':
      if (!unit) {
        body = home() // a unit that no longer exists
      } else if (screen.t === 'lesson') {
        body = (
          <Session
            key={screen.lessonId}
            content={content}
            p={api.p}
            today={api.today}
            update={api.update}
            activity={api.activity}
            lessonId={screen.lessonId}
            onExit={() => setScreen({ t: 'unit', unitId: unit.id })}
          />
        )
      } else if (screen.t === 'checkpoint') {
        body = (
          <Checkpoint
            content={content}
            unit={unit}
            p={api.p}
            today={api.today}
            update={api.update}
            activity={api.activity}
            onExit={() => setScreen({ t: 'unit', unitId: unit.id })}
          />
        )
      } else {
        body = (
          <UnitDetail
            content={content}
            unit={unit}
            p={api.p}
            onBack={() => go(screen.fromList ? 'units' : 'home')}
            onStartLesson={lessonId => setScreen({ t: 'lesson', unitId: unit.id, lessonId })}
            onCheckpoint={() => setScreen({ t: 'checkpoint', unitId: unit.id })}
          />
        )
      }
      break
    case 'units':
      body = <Units content={content} p={api.p} today={api.today} onOpenUnit={unitId => setScreen({ t: 'unit', unitId, fromList: true })} />
      break
    case 'settings':
      body = (
        <Settings
          content={content}
          p={api.p}
          today={api.today}
          now={now}
          update={api.update}
          replace={api.replace}
          audio={audio}
          onReplaced={next => go(next.placement.done ? 'home' : next.placement.inProgress ? 'placement' : 'welcome')}
          onReset={() => go('welcome')}
        />
      )
      break
    default:
      body = home()
  }

  // Tabs only on the top-level screens; never during a session, placement or checkpoint.
  const tab: Tab | null =
    screen.t === 'home'
      ? 'learn'
      : screen.t === 'units' || (screen.t === 'unit' && screen.fromList)
        ? 'units'
        : screen.t === 'unit'
          ? 'learn'
          : screen.t === 'settings'
            ? 'settings'
            : null
  const selectTab = (t: Tab) => go(t === 'learn' ? 'home' : t)

  return (
    <>
      {api.saveError && (
        <div class="banner" role="alert">
          <p>{api.saveError}</p>
          <button type="button" class="btn btn-ghost btn-sm" onClick={api.dismissSaveError}>
            OK
          </button>
        </div>
      )}
      {api.newContent && (
        <div class="toast" role="status">
          New lesson added
        </div>
      )}
      <div class={tab ? 'with-tabs' : undefined}>{body}</div>
      {tab && <TabBar active={tab} onSelect={selectTab} />}
    </>
  )
}
