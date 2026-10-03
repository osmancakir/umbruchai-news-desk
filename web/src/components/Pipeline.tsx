import { JOURNALIST_PROFILES } from '../../../src/journalistProfiles'
import type { NewsDeskInterrupt } from '../../../src/types'
import { STAGES, isEmptyPitch, laneStages, lanesFor, type DeskState, type StageStatus, type TaskRecord } from '../desk'

const STATUS_LABEL: Record<StageStatus, string> = {
  pending: 'Not started',
  running: 'Working',
  done: 'Done',
  waiting: 'Needs you',
  error: 'Failed',
  skipped: 'Skipped',
}

interface Props {
  values: DeskState
  tasks: TaskRecord[]
  interrupt: NewsDeskInterrupt | undefined
  finished: boolean
}

export function Pipeline({ values, tasks, interrupt, finished }: Props) {
  return (
    <section className="panel pipeline" aria-label="Progress per journalist">
      <div className="pipeline-head" aria-hidden>
        <span />
        {STAGES.map((s) => (
          <span key={s.key}>{s.label}</span>
        ))}
      </div>

      {lanesFor(values).map((id) => {
        const profile = JOURNALIST_PROFILES[id]
        const pitch = values.pitches?.[id]
        const stages = laneStages(id, { values, tasks, interrupt, finished })
        const failure = tasks.findLast((t) => t.journalistId === id && t.status === 'error')?.error

        return (
          <div className="lane" key={id}>
            <div className="lane-who">
              <span className="emoji" aria-hidden>
                {profile.emoji}
              </span>
              <div>
                <strong>{profile.characterName}</strong>
                <span className="muted small">{profile.shortLabel}</span>
                {pitch && !isEmptyPitch(pitch) && <span className="lane-title">{pitch.title}</span>}
                {pitch && isEmptyPitch(pitch) && <span className="lane-title muted">No story found today</span>}
                {failure && <span className="lane-error">{failure}</span>}
              </div>
            </div>

            {STAGES.map((s) => (
              <div key={s.key} className={`stage ${stages[s.key]}`} title={`${s.label}: ${STATUS_LABEL[stages[s.key]]}`}>
                <span className="dot" aria-hidden />
                <span className="stage-label">
                  <span className="stage-name">{s.label}</span>
                  {STATUS_LABEL[stages[s.key]]}
                </span>
              </div>
            ))}
          </div>
        )
      })}
    </section>
  )
}
