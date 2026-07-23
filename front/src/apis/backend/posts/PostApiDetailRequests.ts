import type { PostDetail } from "src/types"
import { ApiError, apiFetch, apiFetchWithMeta, type ApiFetchMeta } from "../client"
import type { ApiPostWithContentDto } from "./PostApiDtos"
import { extractPostIdFromSlug, mapPostDetail } from "./PostApiMappers"
import {
  getFreshServerSnapshot,
  isServerRuntime,
  POST_DETAIL_SSR_CACHE_MAX_ENTRIES,
  POST_DETAIL_SSR_CACHE_TTL_MS,
  setServerSnapshot,
} from "./PostApiRequestModel"

let postDetailSsrCache = new Map<string, { value: PostDetail; cachedAt: number }>()
let pendingPostDetailPromises = new Map<string, Promise<PostDetail | null>>()

type PostDetailResult = {
  data: PostDetail | null
  meta: ApiFetchMeta
}

export const resetPostDetailRequestCaches = () => {
  postDetailSsrCache = new Map()
  pendingPostDetailPromises = new Map()
}

export const getPostDetailBySlug = async (slug: string): Promise<PostDetail | null> => {
  const postId = extractPostIdFromSlug(slug)
  if (!postId) return null

  try {
    const post = await apiFetch<ApiPostWithContentDto>(`/post/api/v1/posts/${postId}`)
    const mapped = mapPostDetail(post)

    // slug mismatch should 404 to avoid duplicate-url indexing.
    if (mapped.slug !== slug) return null

    return mapped
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

export const getPostDetailByIdWithMeta = async (id: string): Promise<PostDetailResult> => {
  const postId = Number(id)
  if (!Number.isInteger(postId) || postId <= 0) return { data: null, meta: { stale: false } }
  const endpoint = `/post/api/v1/posts/${postId}`
  const canUseServerSnapshot = isServerRuntime
  const cachedSnapshot =
    canUseServerSnapshot
      ? getFreshServerSnapshot(postDetailSsrCache, endpoint, POST_DETAIL_SSR_CACHE_TTL_MS)
      : null
  if (cachedSnapshot) return { data: cachedSnapshot, meta: { stale: false } }

  if (canUseServerSnapshot) {
    const pendingSnapshot = pendingPostDetailPromises.get(endpoint)
    if (pendingSnapshot) {
      return {
        data: await pendingSnapshot,
        meta: { stale: false },
      }
    }
  }

  const loadPostDetail = async () => {
    const post = await apiFetchWithMeta<ApiPostWithContentDto>(endpoint)
    return {
      data: mapPostDetail(post.data),
      meta: post.meta,
    }
  }

  if (!canUseServerSnapshot) {
    try {
      return await loadPostDetail()
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return { data: null, meta: { stale: false } }
      }
      throw error
    }
  }

  const snapshotPromise = (async () => {
    try {
      const nextDetail = await loadPostDetail()
      if (nextDetail.data) {
        setServerSnapshot(postDetailSsrCache, endpoint, nextDetail.data, POST_DETAIL_SSR_CACHE_MAX_ENTRIES)
      }
      return nextDetail.data
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return null
      }
      const staleSnapshot = postDetailSsrCache.get(endpoint)?.value
      if (staleSnapshot) return staleSnapshot
      throw error
    } finally {
      pendingPostDetailPromises.delete(endpoint)
    }
  })()

  pendingPostDetailPromises.set(endpoint, snapshotPromise)
  return {
    data: await snapshotPromise,
    meta: { stale: false },
  }
}

export const getPostDetailById = async (id: string): Promise<PostDetail | null> =>
  (await getPostDetailByIdWithMeta(id)).data
