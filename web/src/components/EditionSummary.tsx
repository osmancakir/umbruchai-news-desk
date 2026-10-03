import { JOURNALIST_PROFILES } from '../../../src/journalistProfiles'
import type { JournalistId, Pitch, PostResult } from '../../../src/types'

interface Props {
  results: PostResult[]
  pitches: Partial<Record<JournalistId, Pitch>>
}

export function EditionSummary({ results, pitches }: Props) {
  const failed = results.filter((r) => !r.success).length

  return (
    <section className="panel summary" aria-labelledby="summary-heading">
      <h2 id="summary-heading">
        {failed === 0 ? `${results.length} published` : `${results.length - failed} published, ${failed} failed`}
      </h2>
      <ul className="results">
        {results.map((result) => {
          const pitch = Object.values(pitches).find((p) => p?.slug === result.slug)
          const profile = pitch ? JOURNALIST_PROFILES[pitch.journalistId] : undefined
          return (
            <li key={result.slug} className={result.success ? 'ok' : 'failed'}>
              <span className="result-mark" aria-hidden>
                {result.success ? '✓' : '✗'}
              </span>
              <div>
                <strong>{pitch?.title ?? result.slug}</strong>
                <span className="muted small">
                  {profile ? `${profile.emoji} ${profile.characterName} · ` : ''}
                  {result.slug}
                </span>
                <details>
                  <summary>{result.success ? 'Publish log' : 'Error'}</summary>
                  <pre>{result.output}</pre>
                </details>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
