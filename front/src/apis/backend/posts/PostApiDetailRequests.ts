import type { PostDetail } from "src/types"
import { ApiError, apiFetch } from "../client"
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

export const getPostDetailById = async (id: string): Promise<PostDetail | null> => {
  const postId = Number(id)
  if (!Number.isInteger(postId) || postId <= 0) return null
  const endpoint = `/post/api/v1/posts/${postId}`
  const canUseServerSnapshot = isServerRuntime
  const cachedSnapshot =
    canUseServerSnapshot
      ? getFreshServerSnapshot(postDetailSsrCache, endpoint, POST_DETAIL_SSR_CACHE_TTL_MS)
      : null
  if (cachedSnapshot) return cachedSnapshot

  if (canUseServerSnapshot) {
    const pendingSnapshot = pendingPostDetailPromises.get(endpoint)
    if (pendingSnapshot) return pendingSnapshot
  }

  const loadPostDetail = async () => {
    const post = await apiFetch<ApiPostWithContentDto>(endpoint)
    return mapPostDetail(post)
  }

  if (!canUseServerSnapshot) {
    try {
      return await loadPostDetail()
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return null
      }
      throw error
    }
  }

  const snapshotPromise = (async () => {
    try {
      const nextDetail = await loadPostDetail()
      setServerSnapshot(postDetailSsrCache, endpoint, nextDetail, POST_DETAIL_SSR_CACHE_MAX_ENTRIES)
      return nextDetail
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
  return snapshotPromise
}
