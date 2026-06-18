package com.back.boundedContexts.post.adapter.web

data class PublicReadCachePolicy(
    val name: String,
    val maxAgeSeconds: Int,
    val sharedMaxAgeSeconds: Int,
    val staleWhileRevalidateSeconds: Int,
    val noStore: Boolean = false,
)

object PostPublicReadCachePolicies {
    val FEED =
        PublicReadCachePolicy(
            name = "feed-max20-smax60-swr60",
            maxAgeSeconds = 20,
            sharedMaxAgeSeconds = 60,
            staleWhileRevalidateSeconds = 60,
        )
    val FEED_CURSOR =
        PublicReadCachePolicy(
            name = "feed-cursor-max20-smax60-swr60",
            maxAgeSeconds = 20,
            sharedMaxAgeSeconds = 60,
            staleWhileRevalidateSeconds = 60,
        )
    val EXPLORE =
        PublicReadCachePolicy(
            name = "explore-max20-smax60-swr60",
            maxAgeSeconds = 20,
            sharedMaxAgeSeconds = 60,
            staleWhileRevalidateSeconds = 60,
        )
    val EXPLORE_CURSOR =
        PublicReadCachePolicy(
            name = "explore-cursor-max20-smax60-swr60",
            maxAgeSeconds = 20,
            sharedMaxAgeSeconds = 60,
            staleWhileRevalidateSeconds = 60,
        )
    val SEARCH_DEFAULT =
        PublicReadCachePolicy(
            name = "search-max15-smax45-swr45",
            maxAgeSeconds = 15,
            sharedMaxAgeSeconds = 45,
            staleWhileRevalidateSeconds = 45,
        )
    val SEARCH_SHORT =
        PublicReadCachePolicy(
            name = "search-short-max5-smax10-swr15",
            maxAgeSeconds = 5,
            sharedMaxAgeSeconds = 10,
            staleWhileRevalidateSeconds = 15,
        )
    val SEARCH_NO_STORE =
        PublicReadCachePolicy(
            name = "search-high-entropy-no-store",
            maxAgeSeconds = 0,
            sharedMaxAgeSeconds = 0,
            staleWhileRevalidateSeconds = 0,
            noStore = true,
        )
    val TAGS =
        PublicReadCachePolicy(
            name = "tags-max60-smax300-swr300",
            maxAgeSeconds = 60,
            sharedMaxAgeSeconds = 300,
            staleWhileRevalidateSeconds = 300,
        )
    val BOOTSTRAP =
        PublicReadCachePolicy(
            name = "bootstrap-max20-smax60-swr60",
            maxAgeSeconds = 20,
            sharedMaxAgeSeconds = 60,
            staleWhileRevalidateSeconds = 60,
        )
    val DETAIL =
        PublicReadCachePolicy(
            name = "detail-max20-smax60-swr60",
            maxAgeSeconds = 20,
            sharedMaxAgeSeconds = 60,
            staleWhileRevalidateSeconds = 60,
        )
    val RELATED_AUTHOR =
        PublicReadCachePolicy(
            name = "related-author-max15-smax45-swr45",
            maxAgeSeconds = 15,
            sharedMaxAgeSeconds = 45,
            staleWhileRevalidateSeconds = 45,
        )
}
