import { NotionAPI } from "notion-client"
import { CONFIG } from "site.config"
import getPageProperties, {
  NotionPageProperties,
  NotionUser,
} from "src/libs/utils/notion/getPageProperties"
import { BlockMap, CollectionPropertySchemaMap } from "notion-types"
import { TPost, TPostStatus, TPostType } from "src/types"

const POSTS_CACHE_TTL_MS = 60 * 1000
let postsCache: TPost[] | null = null
let postsCacheAt = 0
let pendingPostsPromise: Promise<TPost[]> | null = null

type GetPostsOptions = {
  forceFresh?: boolean
}

type UnknownRecord = Record<string, unknown>

const unwrapRecordValue = <T,>(raw: unknown): T | undefined => {
  if (!raw || typeof raw !== "object") return undefined
  const level1 = (raw as UnknownRecord).value
  if (level1 && typeof level1 === "object") {
    const level2 = (level1 as UnknownRecord).value
    if (level2 !== undefined) return level2 as T
    return level1 as T
  }
  return raw as T
}

const getString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string")
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return [value]
  }
  return []
}

const isPostType = (value: string): value is TPostType =>
  value === "Post" || value === "Paper" || value === "Page"

const isPostStatus = (value: string): value is TPostStatus =>
  value === "Private" || value === "Public" || value === "PublicOnDetail"

const normalizePostProperties = (
  properties: NotionPageProperties
): TPost | null => {
  const title = getString(properties.title)
  const slug = getString(properties.slug)
  const id = getString(properties.id)
  const createdTime =
    getString(properties.createdTime) || new Date().toISOString()

  if (!title || !slug || !id) return null

  const date = properties.date as { start_date?: string } | undefined
  const startDate =
    getString(date?.start_date) || new Date(createdTime).toISOString().slice(0, 10)

  const type = toStringArray(properties.type).filter(isPostType)
  const status = toStringArray(properties.status).filter(isPostStatus)
  if (!type.length || !status.length) return null

  const tags = toStringArray(properties.tags)
  const category = toStringArray(properties.category)
  const summary = getString(properties.summary)
  const thumbnail = getString(properties.thumbnail)
  const fullWidth =
    typeof properties.fullWidth === "boolean" ? properties.fullWidth : false

  const rawAuthors = Array.isArray(properties.author) ? properties.author : []
  const author = rawAuthors
    .map((rawAuthor) => {
      if (!rawAuthor || typeof rawAuthor !== "object") return null
      const authorRecord = rawAuthor as Record<string, unknown>
      const authorId = getString(authorRecord.id)
      const authorName = getString(authorRecord.name)
      if (!authorId || !authorName) return null
      const profilePhoto = getString(authorRecord.profile_photo)
      if (profilePhoto) {
        return {
          id: authorId,
          name: authorName,
          profile_photo: profilePhoto,
        }
      }
      return {
        id: authorId,
        name: authorName,
      }
    })
    .filter(
      (
        authorItem
      ): authorItem is { id: string; name: string; profile_photo?: string } =>
        authorItem !== null
    )

  const post: TPost = {
    id,
    title,
    slug,
    createdTime,
    date: { start_date: startDate },
    type,
    status,
    fullWidth,
  }

  if (tags.length) post.tags = tags
  if (category.length) post.category = category
  if (summary) post.summary = summary
  if (thumbnail) post.thumbnail = thumbnail
  if (author.length) post.author = author

  return post
}

export const getPosts = async (
  options: GetPostsOptions = {}
): Promise<TPost[]> => {
  const { forceFresh = false } = options
  if (!forceFresh && postsCache && Date.now() - postsCacheAt < POSTS_CACHE_TTL_MS) {
    return postsCache
  }
  if (!forceFresh && pendingPostsPromise) return pendingPostsPromise

  pendingPostsPromise = (async () => {
    const api = new NotionAPI()
    const pageId = CONFIG.notionConfig.pageId

    try {
      const recordMap = await api.getPage(pageId)

      // 1. 컬렉션(데이터베이스) 찾기
      const collectionMap = recordMap.collection || {}
      const collectionKeys = Object.keys(collectionMap)
      let collectionId = ""
      let schema: CollectionPropertySchemaMap | null = null

      for (const key of collectionKeys) {
        const rawData = collectionMap[key]
        const data = unwrapRecordValue<{ schema?: CollectionPropertySchemaMap }>(
          rawData
        )
        if (data?.schema) {
          collectionId = key
          schema = data.schema
          break
        }
      }

      if (!collectionId || !schema) {
        throw new Error(
          "[getPosts] 유효한 스키마를 찾지 못했습니다. (Page ID 확인 필요)"
        )
      }
      const resolvedSchema = schema

      // 2. 게시글 ID 목록 추출
      const collectionViewMap = recordMap.collection_view || {}
      const collectionViewId = Object.keys(collectionViewMap)[0]
      let pageIds: string[] = []

      if (
        recordMap.collection_query &&
        recordMap.collection_query[collectionId] &&
        recordMap.collection_query[collectionId][collectionViewId]
      ) {
        const view = recordMap.collection_query[collectionId][collectionViewId]
        pageIds =
          view.collection_group_results?.type === "results"
            ? view.collection_group_results.blockIds
            : view.blockIds || []
      } else {
        const blockMap = recordMap.block || {}
        pageIds = Object.keys(blockMap).filter((id) => {
          const rawBlock = blockMap[id]
          const block = unwrapRecordValue<{ type?: string; parent_id?: string }>(
            rawBlock
          )
          return (
            block && block.type === "page" && block.parent_id === collectionId
          )
        })
      }

      // 3. 데이터 매핑
      const blockMap = recordMap.block as BlockMap
      const userCache = new Map<string, NotionUser>()
      const mappedPosts = await Promise.all(
        pageIds.map(async (id) => {
          const properties = await getPageProperties(
            id,
            blockMap,
            resolvedSchema,
            {
              api,
              userCache,
            }
          )

          // 속성 이름 정규화 (Title, title, 제목 -> title)
          const keys = Object.keys(properties)
          const titleKey = keys.find(
            (k) => k.toLowerCase() === "title" || k === "제목" || k === "이름"
          )
          const dateKey = keys.find(
            (k) => k.toLowerCase() === "date" || k === "날짜"
          )
          const slugKey = keys.find(
            (k) => k.toLowerCase() === "slug" || k === "슬러그"
          )
          const statusKey = keys.find(
            (k) => k.toLowerCase() === "status" || k === "상태"
          )
          const typeKey = keys.find(
            (k) => k.toLowerCase() === "type" || k === "종류"
          )

          const mutableProperties = properties as Record<string, unknown>
          if (titleKey) mutableProperties.title = properties[titleKey]
          if (dateKey) mutableProperties.date = properties[dateKey]
          if (slugKey) mutableProperties.slug = properties[slugKey]
          if (statusKey) mutableProperties.status = properties[statusKey]
          if (typeKey) mutableProperties.type = properties[typeKey]

          return normalizePostProperties(properties)
        })
      )

      const posts: TPost[] = mappedPosts.filter(
        (post): post is TPost => post !== null
      )

      // 4. 정렬 (최신순)
      posts.sort((a, b) => {
        const dateA = new Date(a.date?.start_date || a.createdTime).getTime()
        const dateB = new Date(b.date?.start_date || b.createdTime).getTime()
        return dateB - dateA
      })

      postsCache = posts
      postsCacheAt = Date.now()
      console.log(
        `✅ [getPosts] 총 ${posts.length}개의 글을 성공적으로 가져왔습니다.`
      )
      return posts
    } catch (error) {
      console.error("❌ [getPosts] 데이터 로드 중 에러 발생:", error)
      throw error
    } finally {
      pendingPostsPromise = null
    }
  })()

  return pendingPostsPromise
}
