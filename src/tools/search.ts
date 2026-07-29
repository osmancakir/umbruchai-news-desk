import { tools } from '@langchain/openai'
import type { WebSearchOptions } from '@langchain/openai'

type SearchContextSize = NonNullable<WebSearchOptions['search_context_size']>

export function createWebSearchTool(searchContextSize: SearchContextSize = 'medium') {
  return tools.webSearch({
    search_context_size: searchContextSize,
  })
}
