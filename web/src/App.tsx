import { useCallback, useEffect, useState } from 'react'
import { Client } from '@langchain/langgraph-sdk'
import { useStream } from '@langchain/langgraph-sdk/react'
import type { NewsDeskInterrupt } from '../../src/types'
import { deskHeadline, journalistForTask, type DeskInput, type DeskState, type TaskRecord } from './desk'
import { StartForm } from './components/StartForm'
import { Pipeline } from './components/Pipeline'
import { PitchPicker } from './components/PitchPicker'
import { ImageReview } from './components/ImageReview'
import { EditionSummary } from './components/EditionSummary'

const API_URL = `${window.location.origin}/api`
const ASSISTANT_ID = 'news_desk'
const client = new Client({ apiUrl: API_URL })

function readThreadFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('thread')
}

function writeThreadToUrl(threadId: string | null) {
  const url = new URL(window.location.href)
  if (threadId) url.searchParams.set('thread', threadId)
  else url.searchParams.delete('thread')
  window.history.replaceState(null, '', url)
}

export function App() {
  const [threadId, setThreadId] = useState<string | null>(readThreadFromUrl)
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  // Nodes still queued on an idle thread: a run that was stopped or died with the server.
  const [unfinishedNodes, setUnfinishedNodes] = useState<string[]>([])

  const stream = useStream<DeskState, { InterruptType: NewsDeskInterrupt }>({
    client,
    assistantId: ASSISTANT_ID,
    threadId,
    onThreadId: (id) => {
      setThreadId(id)
      writeThreadToUrl(id)
    },
    // Rejoin a run that is still going after a page reload.
    reconnectOnMount: true,
    // Declaring the state parameter makes the SDK refetch the thread after each run.
    // Without it, the cached thread head keeps serving the interrupt just answered.
    onFinish: (state) => setUnfinishedNodes(state?.next ?? []),
    onTaskEvent: (data, { namespace }) => {
      if (namespace?.length) return
      setTasks((prev) => {
        const existing = prev.find((t) => t.id === data.id)
        let next: TaskRecord
        if ('input' in data) {
          next = {
            id: data.id,
            node: data.name,
            journalistId: journalistForTask(data.name, data.input),
            status: 'running',
          }
        } else if ('error' in data) {
          next = { ...(existing ?? { id: data.id, node: data.name, journalistId: null }), status: 'error', error: data.error }
        } else {
          // An interrupted task reports a result too; the interrupt panel covers it.
          next = { ...(existing ?? { id: data.id, node: data.name, journalistId: null }), status: 'done' }
        }
        return existing ? prev.map((t) => (t.id === data.id ? next : t)) : [...prev, next]
      })
    },
  })

  const values = stream.values ?? {}
  const interrupt = stream.interrupt?.value
  const finished = !stream.isLoading && !interrupt
  const hasRun = !!threadId

  useEffect(() => {
    if (!threadId || !finished) {
      setUnfinishedNodes([])
      return
    }
    let cancelled = false
    client.threads
      .getState(threadId)
      .then((state) => {
        if (!cancelled) setUnfinishedNodes(state.next)
      })
      .catch(() => {
        if (!cancelled) setUnfinishedNodes([])
      })
    return () => {
      cancelled = true
    }
  }, [threadId, finished])

  const start = useCallback(
    (input: DeskInput) => {
      setTasks([])
      void stream.submit(input, { streamResumable: true })
    },
    [stream],
  )

  const resume = useCallback(
    (answer: string) => {
      void stream.submit(undefined, { command: { resume: answer }, streamResumable: true })
    },
    [stream],
  )

  // Null input resumes from the last checkpoint; branches that already finished are not rerun.
  const continueRun = useCallback(() => {
    void stream.submit(undefined, { streamResumable: true })
  }, [stream])

  const newEdition = () => {
    setTasks([])
    setThreadId(null)
    writeThreadToUrl(null)
    stream.switchThread(null)
  }

  return (
    <div className="desk">
      <header className="masthead">
        <div>
          <p className="kicker">Umbruch AI · Editor's Desk</p>
          <h1>{values.date ? `Edition of ${values.date}` : "Today's edition"}</h1>
          <p className="headline" aria-live="polite">
            {stream.isLoading && <span className="spinner" aria-hidden />}
            {deskHeadline({ interrupt, isLoading: stream.isLoading, tasks, values })}
          </p>
        </div>
        {hasRun && (
          <div className="masthead-actions">
            {stream.isLoading && (
              <button className="btn ghost" onClick={() => void stream.stop()}>
                Stop run
              </button>
            )}
            <button className="btn ghost" onClick={newEdition} disabled={stream.isLoading}>
              New edition
            </button>
          </div>
        )}
      </header>

      {stream.error != null && (
        <div className="alert" role="alert">
          <strong>The run failed.</strong> {errorMessage(stream.error)}
        </div>
      )}

      {!hasRun && <StartForm onStart={start} />}

      {hasRun && finished && unfinishedNodes.length > 0 && (
        <div className="panel notice">
          <div>
            <strong>This run stopped before it was done.</strong>
            <span className="muted small">Still to run: {unfinishedNodes.join(', ')}</span>
          </div>
          <button className="btn primary" onClick={continueRun}>
            Continue the run
          </button>
        </div>
      )}

      {hasRun && (
        <>
          {interrupt?.kind === 'pitch-selection' && (
            <PitchPicker interrupt={interrupt} onDecide={resume} disabled={stream.isLoading} />
          )}
          {interrupt?.kind === 'image-review' && (
            <ImageReview interrupt={interrupt} onDecide={resume} disabled={stream.isLoading} />
          )}
          {finished && values.postResults && values.postResults.length > 0 && (
            <EditionSummary results={values.postResults} pitches={values.pitches ?? {}} />
          )}
          <Pipeline values={values} tasks={tasks} interrupt={interrupt} finished={finished} />
        </>
      )}
    </div>
  )
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return JSON.stringify(error)
}
