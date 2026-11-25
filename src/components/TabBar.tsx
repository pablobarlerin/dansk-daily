import type { JSX } from 'preact'

export type Tab = 'learn' | 'units' | 'settings'

const TABS: { id: Tab; label: string; icon: JSX.Element }[] = [
  {
    id: 'learn',
    label: 'Learn',
    icon: (
      <>
        <path d="M4 11l8-7 8 7v9H4v-9Z" />
        <path d="M10 20v-5h4v5" />
      </>
    ),
  },
  { id: 'units', label: 'Units', icon: <path d="M4 5h16M4 12h16M4 19h10" /> },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
      </>
    ),
  },
]

/** Bottom tab bar from the approved draft: Learn / Units / Settings. */
export function TabBar({ active, onSelect }: { active: Tab; onSelect: (t: Tab) => void }) {
  return (
    <nav class="tabs" aria-label="Main">
      {TABS.map(t => (
        <button
          key={t.id}
          type="button"
          class={`tab${t.id === active ? ' on' : ''}`}
          aria-current={t.id === active ? 'page' : undefined}
          onClick={() => onSelect(t.id)}
        >
          <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
            {t.icon}
          </svg>
          {t.label}
        </button>
      ))}
    </nav>
  )
}
