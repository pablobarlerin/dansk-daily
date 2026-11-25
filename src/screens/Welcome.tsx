import { Brand } from '../components/Brand'

interface Props {
  onPlacement: () => void
  onSkip: () => void
}

export function Welcome({ onPlacement, onSkip }: Props) {
  return (
    <main class="screen welcome">
      <div class="top">
        <Brand />
      </div>
      <div class="welcome-body">
        <p class="welcome-hej" lang="da">Hej!</p>
        <h1 class="welcome-title">Learn Danish, 15 minutes a day</h1>
        <p class="welcome-copy">
          Dansk Daily follows your book unit by unit. Words come back just before you'd forget them,
          so a short session each day is enough.
        </p>
        <p class="welcome-copy">
          A quick test finds where to start, so you don't repeat what you already know from class.
        </p>
      </div>
      <div class="welcome-actions">
        <button type="button" class="btn btn-primary" onClick={onPlacement}>
          Find my level
        </button>
        <button type="button" class="btn btn-ghost" onClick={onSkip}>
          Skip, start from the beginning
        </button>
      </div>
    </main>
  )
}
