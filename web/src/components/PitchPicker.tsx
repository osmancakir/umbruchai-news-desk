import { useState } from 'react'
import { ALL_JOURNALIST_IDS, type JournalistId, type PitchSelectionInterrupt } from '../../../src/types'
import { JOURNALIST_PROFILES } from '../../../src/journalistProfiles'
import { isEmptyPitch } from '../desk'

interface Props {
  interrupt: PitchSelectionInterrupt
  onDecide: (answer: string) => void
  disabled: boolean
}

export function PitchPicker({ interrupt, onDecide, disabled }: Props) {
  const pitchable = ALL_JOURNALIST_IDS.filter((id) => {
    const pitch = interrupt.pitches[id]
    return pitch && !isEmptyPitch(pitch)
  })
  const [selected, setSelected] = useState<Set<JournalistId>>(new Set())

  const toggle = (id: JournalistId) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allSelected = pitchable.length > 0 && pitchable.every((id) => selected.has(id))

  return (
    <section className="panel decision" aria-labelledby="pitch-heading">
      <div className="decision-head">
        <div>
          <p className="kicker accent">Needs your decision</p>
          <h2 id="pitch-heading">Today's pitches</h2>
        </div>
        <button
          className="btn ghost"
          onClick={() => setSelected(allSelected ? new Set() : new Set(pitchable))}
          disabled={disabled || pitchable.length === 0}
        >
          {allSelected ? 'Clear selection' : 'Select all'}
        </button>
      </div>

      <div className="pitch-grid">
        {ALL_JOURNALIST_IDS.filter((id) => interrupt.pitches[id]).map((id) => {
          const pitch = interrupt.pitches[id]!
          const profile = JOURNALIST_PROFILES[id]
          const empty = isEmptyPitch(pitch)
          const isSelected = selected.has(id)
          return (
            <label key={id} className={`pitch ${isSelected ? 'selected' : ''} ${empty ? 'empty' : ''}`}>
              <input type="checkbox" checked={isSelected} onChange={() => toggle(id)} disabled={disabled || empty} />
              <div className="pitch-byline">
                <span aria-hidden>{profile.emoji}</span> {profile.characterName}
              </div>
              <h3>{empty ? 'No story found today' : pitch.title}</h3>
              {!empty && (
                <>
                  <div className="tags">
                    <span className="tag">{pitch.category}</span>
                    {pitch.mode && <span className="tag">{pitch.mode}</span>}
                    {pitch.leaning && <span className="tag">{pitch.leaning}</span>}
                    {pitch.agencyLevel && <span className="tag">{pitch.agencyLevel}</span>}
                  </div>
                  <p>{pitch.summary}</p>
                  <p className="why">
                    <strong>Why now:</strong> {pitch.whyItMattersNow}
                  </p>
                  {pitch.sources.length > 0 && (
                    <ul className="sources">
                      {pitch.sources.map((source) => (
                        <li key={source.url}>
                          <a href={source.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                            {source.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </label>
          )
        })}
      </div>

      <div className="actions">
        {/* LangGraph rejects an empty resume value; "none" matches no journalist, so nothing runs. */}
        <button className="btn ghost" onClick={() => onDecide('none')} disabled={disabled}>
          Run nothing today
        </button>
        <button
          className="btn primary"
          onClick={() => onDecide(ALL_JOURNALIST_IDS.filter((id) => selected.has(id)).join(','))}
          disabled={disabled || selected.size === 0}
        >
          Write {selected.size || ''} {selected.size === 1 ? 'article' : 'articles'}
        </button>
      </div>
    </section>
  )
}
