import { StateGraph, Send, MemorySaver, START, END } from '@langchain/langgraph'
import { StateAnnotation } from './state.js'
import {
  pitchJournalist,
  presentPitches,
  generateArticle,
  routeGeneratedArticlesToValidation,
  validateAndFixArticle,
  generateArticleImage,
  reviewArticleImage,
  routeAfterValidation,
  routeAfterImageReview,
  postAllArticles,
  finalNote,
} from './nodes.js'
import { ALL_JOURNALIST_IDS } from '../types.js'
import type { State } from './state.js'

function kickoffPitching(state: State): Send[] {
  const ids = state.targetJournalistId ? [state.targetJournalistId] : ALL_JOURNALIST_IDS
  return ids.map((id) => new Send('pitchJournalist', { ...state, activeJournalistId: id }))
}

function kickoffGeneration(state: State): Send[] | string {
  const selectedIds = state.selectedIds ?? []
  if (selectedIds.length === 0) {
    console.log('[Editor] No articles selected. Exiting.')
    return 'finalNote'
  }
  return selectedIds.map((id) => new Send('generateArticle', { ...state, activeJournalistId: id }))
}

export function buildGraph() {
  // All addNode calls must be chained so TypeScript accumulates the node names
  // in the graph's type. Assigning without chaining loses that inference.
  const compiled = new StateGraph(StateAnnotation)
    .addNode('pitchJournalist', pitchJournalist)
    .addNode('presentPitches', presentPitches)
    .addNode('generateArticle', generateArticle)
    .addNode('validateAndFixArticle', validateAndFixArticle)
    .addNode('generateArticleImage', generateArticleImage)
    .addNode('reviewArticleImage', reviewArticleImage)
    .addNode('postAllArticles', postAllArticles)
    .addNode('finalNote', finalNote)
    .addConditionalEdges(START, kickoffPitching, ['pitchJournalist'])
    .addEdge('pitchJournalist', 'presentPitches')
    .addConditionalEdges('presentPitches', kickoffGeneration, ['generateArticle', 'finalNote'])
    .addConditionalEdges('generateArticle', routeGeneratedArticlesToValidation, ['validateAndFixArticle'])
    .addConditionalEdges('validateAndFixArticle', routeAfterValidation, ['generateArticleImage', 'postAllArticles'])
    .addEdge('generateArticleImage', 'reviewArticleImage')
    .addConditionalEdges('reviewArticleImage', routeAfterImageReview, ['generateArticleImage', 'postAllArticles'])
    .addEdge('postAllArticles', 'finalNote')
    .addEdge('finalNote', END)
    .compile({ checkpointer: new MemorySaver() })

  return compiled
}

export const graph = buildGraph()
