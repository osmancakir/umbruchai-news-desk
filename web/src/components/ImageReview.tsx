import { useState } from 'react'
import type { ImageReviewInterrupt } from '../../../src/types'
import { JOURNALIST_PROFILES } from '../../../src/journalistProfiles'

interface Props {
  interrupt: ImageReviewInterrupt
  onDecide: (answer: string) => void
  disabled: boolean
}

// reviewArticleImage treats these replies as approval, so a new prompt must not be one of them.
const APPROVAL_WORDS = new Set(['ok', 'okay', 'yes'])

export function ImageReview({ interrupt, onDecide, disabled }: Props) {
  const [prompt, setPrompt] = useState('')
  const profile = JOURNALIST_PROFILES[interrupt.journalistId]
  const trimmed = prompt.trim()
  const promptUsable = trimmed.length > 0 && !APPROVAL_WORDS.has(trimmed.toLowerCase())

  return (
    <section className="panel decision" aria-labelledby="image-heading">
      <div className="decision-head">
        <div>
          <p className="kicker accent">Needs your decision</p>
          <h2 id="image-heading">Illustration for “{interrupt.articleTitle}”</h2>
          <p className="muted small">
            <span aria-hidden>{profile.emoji}</span> {profile.characterName}
          </p>
        </div>
      </div>

      {/* key: a regenerated image is a new interrupt, so the prompt box resets with it. */}
      <figure className="illustration" key={interrupt.image.slice(-64)}>
        <img src={interrupt.image} alt={`Generated illustration for ${interrupt.articleTitle}`} />
      </figure>

      <div className="review-actions">
        <button className="btn primary" onClick={() => onDecide('ok')} disabled={disabled}>
          Approve illustration
        </button>

        <form
          className="regenerate"
          onSubmit={(e) => {
            e.preventDefault()
            if (promptUsable) {
              onDecide(trimmed)
              setPrompt('')
            }
          }}
        >
          <label className="field grow">
            <span>Or describe a different image</span>
            <textarea
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. a crowded train platform at dawn, seen from above"
              disabled={disabled}
            />
          </label>
          <button className="btn" type="submit" disabled={disabled || !promptUsable}>
            Regenerate
          </button>
        </form>
      </div>
    </section>
  )
}
