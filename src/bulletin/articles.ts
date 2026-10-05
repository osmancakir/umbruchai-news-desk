import { JOURNALIST_PROFILES } from '../journalistProfiles.js'
import { fetchWithRetries, sanityOptionsFromEnv } from '../tools/postArticle.js'

/** A published article, reduced to what the bulletin needs to read and show. */
export interface BulletinArticle {
  slug: string
  date: string
  category: string
  title: string
  subtitle: string
  summary: string
  imageUrl: string | null
  journalist: string | null
}

interface ArticleRow extends Omit<BulletinArticle, 'journalist'> {
  agentRef: string | null
}

const ARTICLES_QUERY = `*[_type == "article" && language == "german" && date >= $from && date < $to]
  | order(date desc) [0...$limit] {
    "slug": slug.current,
    date,
    category,
    "title": coalesce(title.medium, title.easy),
    subtitle,
    "summary": coalesce(summary.medium, summary.easy),
    "imageUrl": leadingImage.image.asset->url,
    "agentRef": agents[0]._ref
  }`

const JOURNALIST_BY_REF = new Map(
  Object.values(JOURNALIST_PROFILES).map((profile) => [profile.agentRef, profile.characterName]),
)

/** Published German articles whose `date` falls in [from, to). */
export async function fetchBulletinArticles(from: Date, to: Date, limit: number): Promise<BulletinArticle[]> {
  const options = sanityOptionsFromEnv(4, 60)
  const params = new URLSearchParams({
    query: ARTICLES_QUERY,
    $from: JSON.stringify(from.toISOString()),
    $to: JSON.stringify(to.toISOString()),
    $limit: String(limit),
    perspective: 'published',
  })
  const url = `https://${options.projectId}.api.sanity.io/${options.apiVersion}/data/query/${options.dataset}?${params}`

  const payload = await fetchWithRetries(
    url,
    { headers: { Authorization: `Bearer ${options.token}` } },
    { label: 'Sanity query', attempts: options.attempts, timeoutSeconds: options.timeoutSeconds },
  ) as { result?: ArticleRow[] }

  return (payload.result ?? [])
    .filter((row) => row.slug && row.title && row.summary)
    .map(({ agentRef, ...row }) => ({
      ...row,
      subtitle: row.subtitle ?? '',
      journalist: (agentRef && JOURNALIST_BY_REF.get(agentRef)) ?? null,
    }))
}
