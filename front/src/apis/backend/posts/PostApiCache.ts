import type { QueryClient } from "@tanstack/react-query"
import { queryKey } from "src/constants/queryKey"
import { clearFeedExplorerRestoreCache } from "src/libs/feed/feedRestoreCache"
import { evictBrowserRevalidateCacheEntries } from "../client"
import { resetPostsRequestCaches } from "./PostApiRequests"

const PUBLIC_POST_READ_CACHE_PATH_REGEX =
  /^\/post\/api\/v1\/posts\/(?:feed|explore|search|tags|related\/author)(?:\/|$)|^\/post\/api\/v1\/posts\/[0-9]+(?:\/|$)/i

export const invalidatePublicPostReadCaches = async (
  queryClient?: QueryClient,
  postId?: string | number
) => {
  resetPostsRequestCaches()

  if (typeof window !== "undefined") {
    clearFeedExplorerRestoreCache()
    evictBrowserRevalidateCacheEntries((url) => {
      try {
        const parsed = new URL(url)
        return PUBLIC_POST_READ_CACHE_PATH_REGEX.test(parsed.pathname)
      } catch {
        return false
      }
    })
  }

  if (!queryClient) return

  await Promise.all([
    queryClient.cancelQueries({ queryKey: ["posts"] }),
    queryClient.cancelQueries({ queryKey: ["tags"] }),
    queryClient.cancelQueries({ queryKey: ["post"] }),
  ])

  queryClient.removeQueries({ queryKey: ["posts"] })
  queryClient.removeQueries({ queryKey: queryKey.tags() })
  queryClient.removeQueries({ queryKey: queryKey.postsTotalCount() })
  queryClient.removeQueries({ queryKey: ["post"] })
  if (postId !== undefined && postId !== null && String(postId).trim()) {
    queryClient.removeQueries({ queryKey: queryKey.post(postId) })
  }
}
