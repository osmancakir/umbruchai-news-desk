import { useState, type FormEvent } from 'react'
import { ALL_JOURNALIST_IDS, type JournalistId } from '../../../src/types'
import { JOURNALIST_PROFILES } from '../../../src/journalistProfiles'
import type { DeskInput } from '../desk'

function today(): string {
  return new Date().toISOString().split('T')[0]
}

export function StartForm({ onStart }: { onStart: (input: DeskInput) => void }) {
  const [date, setDate] = useState(today)
  const [target, setTarget] = useState<JournalistId | ''>('')
  const [pitchIdea, setPitchIdea] = useState('')
  const [skipImages, setSkipImages] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onStart({
      date,
      targetJournalistId: target || undefined,
      pitchIdea: target && pitchIdea.trim() ? pitchIdea.trim() : undefined,
      skipImageGeneration: skipImages,
    })
  }

  return (
    <form className="panel start" onSubmit={submit}>
      <h2>Open the desk</h2>
      <p className="muted">
        Every journalist researches one story and pitches it. You pick what runs, then approve each illustration
        before anything is published.
      </p>

      <div className="field-row">
        <label className="field">
          <span>Edition date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>

        <label className="field grow">
          <span>Who pitches</span>
          <select value={target} onChange={(e) => setTarget(e.target.value as JournalistId | '')}>
            <option value="">The whole desk (5 journalists)</option>
            {ALL_JOURNALIST_IDS.map((id) => (
              <option key={id} value={id}>
                {JOURNALIST_PROFILES[id].emoji} {JOURNALIST_PROFILES[id].characterName} only
              </option>
            ))}
          </select>
        </label>
      </div>

      {target && (
        <label className="field">
          <span>Story idea (optional)</span>
          <textarea
            rows={2}
            value={pitchIdea}
            onChange={(e) => setPitchIdea(e.target.value)}
            placeholder="Leave empty to let them find today's story"
          />
        </label>
      )}

      <label className="check">
        <input type="checkbox" checked={skipImages} onChange={(e) => setSkipImages(e.target.checked)} />
        <span>Skip illustrations</span>
      </label>

      <div className="actions">
        <button className="btn primary" type="submit">
          Start pitching
        </button>
      </div>
    </form>
  )
}
