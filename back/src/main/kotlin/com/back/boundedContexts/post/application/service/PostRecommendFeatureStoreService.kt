package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.dto.PostMetaExtractor
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.util.concurrent.ConcurrentHashMap

/**
 * PostRecommendFeatureStoreService는 추천 랭킹용 피처를 post_attr(JSON)로 영속화한다.
 * hit/engagement/체류프록시/태그 신호를 저장하고, 로컬 TTL 캐시로 반복 DB 조회를 줄인다.
 */
@Service
class PostRecommendFeatureStoreService(
    private val postAttrRepository: PostAttrRepositoryPort,
    private val objectMapper: ObjectMapper,
    @Value("\${custom.post.recommend.feature-store.enabled:true}")
    enabled: Boolean,
    @Value("\${custom.post.recommend.feature-store.stale-seconds:900}")
    staleSeconds: Long,
    @Value("\${custom.post.recommend.feature-store.local-cache-ttl-seconds:120}")
    localCacheTtlSeconds: Long,
) {
    data class RecommendFeatureVector(
        val hitCount: Int,
        val likesCount: Int,
        val dwellProxySeconds: Double,
        val normalizedTags: List<String>,
    )

    private data class PersistedFeatureSnapshot(
        val version: Int,
        val postVersion: Long?,
        val modifiedAtEpochMs: Long?,
        val hitCount: Int,
        val likesCount: Int,
        val contentLength: Int,
        val contentHash: Int,
        val dwellProxySeconds: Double,
        val normalizedTags: List<String>,
        val capturedAtEpochMs: Long,
    )

    private data class LocalCacheEntry(
        val expiresAtEpochMs: Long,
        val snapshot: PersistedFeatureSnapshot,
    )

    private val logger = LoggerFactory.getLogger(PostRecommendFeatureStoreService::class.java)
    private val enabled = enabled
    private val staleMillis = staleSeconds.coerceIn(10, 86_400) * 1_000
    private val localCacheTtlMillis = localCacheTtlSeconds.coerceIn(5, 3_600) * 1_000
    private val localCache = ConcurrentHashMap<Long, LocalCacheEntry>()
    internal var clock: Clock = Clock.systemUTC()

    fun resolveForPosts(posts: List<Post>): Map<Long, RecommendFeatureVector> {
        if (posts.isEmpty()) return emptyMap()
        val now = clock.millis()
        if (!enabled) {
            return posts.associate { post -> post.id to buildSnapshot(post, now).toFeatureVector(post) }
        }

        val resolved = LinkedHashMap<Long, RecommendFeatureVector>(posts.size)
        val uncachedPosts = ArrayList<Post>(posts.size)
        for (post in posts) {
            val cached = resolveCachedSnapshot(post, now)
            if (cached != null) {
                resolved[post.id] = cached.toFeatureVector(post)
            } else {
                uncachedPosts.add(post)
            }
        }
        if (uncachedPosts.isEmpty()) return resolved

        val attrByPostId =
            postAttrRepository
                .findBySubjectInAndNameIn(uncachedPosts, listOf(FEATURE_STORE_ATTR_NAME))
                .associateBy { it.subject.id }

        for (post in uncachedPosts) {
            resolved[post.id] = resolveMissFeature(post, attrByPostId[post.id], now)
        }
        return resolved
    }

    fun refresh(post: Post) {
        if (!enabled) return
        val now = clock.millis()
        val snapshot = buildSnapshot(post, now)
        persistSnapshot(post, snapshot)
        cacheSnapshot(post.id, snapshot, now)
    }

    fun evict(postId: Long) {
        localCache.remove(postId)
    }

    internal fun localCacheSize(): Int = localCache.size

    private fun resolveCachedSnapshot(
        post: Post,
        now: Long,
    ): PersistedFeatureSnapshot? {
        val snapshot =
            localCache[post.id]
                ?.takeIf { it.expiresAtEpochMs > now }
                ?.snapshot
                ?: return null
        return snapshot.takeIf { !isSnapshotStale(it, now) && matchesPost(post, it) }
    }

    private fun resolveMissFeature(
        post: Post,
        persistedAttr: PostAttr?,
        now: Long,
    ): RecommendFeatureVector {
        val persistedSnapshot =
            persistedAttr
                ?.strValue
                ?.let(::parsePersistedSnapshot)
                ?.takeIf { !isSnapshotStale(it, now) && matchesPost(post, it) }

        if (persistedSnapshot != null) {
            cacheSnapshot(post.id, persistedSnapshot, now)
            return persistedSnapshot.toFeatureVector(post)
        }

        // 읽기 경로에서는 write TX가 없으므로 DB(post_attr) 저장 없이 L1 캐시만 채운다.
        val rebuilt = buildSnapshot(post, now)
        cacheSnapshot(post.id, rebuilt, now)
        return rebuilt.toFeatureVector(post)
    }

    private fun parsePersistedSnapshot(raw: String): PersistedFeatureSnapshot? =
        runCatching { objectMapper.readValue(raw, PersistedFeatureSnapshot::class.java) }
            .onFailure { exception ->
                logger.warn("recommend_feature_store_parse_failed message={}", exception.message ?: exception::class.simpleName)
            }.getOrNull()

    private fun persistSnapshot(
        post: Post,
        snapshot: PersistedFeatureSnapshot,
    ) {
        runCatching {
            val attr =
                postAttrRepository.findBySubjectAndName(post, FEATURE_STORE_ATTR_NAME)
                    ?: PostAttr(0, post, FEATURE_STORE_ATTR_NAME, "")
            attr.strValue = objectMapper.writeValueAsString(snapshot)
            postAttrRepository.save(attr)
        }.onFailure { exception ->
            logger.warn("recommend_feature_store_save_failed postId={}", post.id, exception)
        }
    }

    private fun cacheSnapshot(
        postId: Long,
        snapshot: PersistedFeatureSnapshot,
        nowEpochMs: Long,
    ) {
        localCache[postId] = LocalCacheEntry(nowEpochMs + localCacheTtlMillis, snapshot)
        if (localCache.size > MAX_LOCAL_CACHE_ENTRIES) {
            evictOverflowEntries(nowEpochMs)
        }
    }

    private fun evictOverflowEntries(nowEpochMs: Long) {
        localCache.entries.removeIf { it.value.expiresAtEpochMs <= nowEpochMs }
        while (localCache.size > MAX_LOCAL_CACHE_ENTRIES) {
            var oldestKey: Long? = null
            var oldestExpiry = Long.MAX_VALUE
            for ((key, entry) in localCache) {
                if (entry.expiresAtEpochMs <= oldestExpiry) {
                    oldestExpiry = entry.expiresAtEpochMs
                    oldestKey = key
                }
            }
            oldestKey?.let(localCache::remove)
        }
    }

    private fun isSnapshotStale(
        snapshot: PersistedFeatureSnapshot,
        nowEpochMs: Long,
    ): Boolean = nowEpochMs - snapshot.capturedAtEpochMs > staleMillis

    private fun matchesPost(
        post: Post,
        snapshot: PersistedFeatureSnapshot,
    ): Boolean {
        val content = post.content
        return snapshot.version == SNAPSHOT_VERSION &&
            snapshot.postVersion == post.version &&
            snapshot.modifiedAtEpochMs == post.modifiedAt.toEpochMilli() &&
            snapshot.contentLength == content.length &&
            snapshot.contentHash == content.hashCode()
    }

    private fun buildSnapshot(
        post: Post,
        nowEpochMs: Long,
    ): PersistedFeatureSnapshot {
        val content = post.content
        val normalizedTags =
            PostMetaExtractor
                .extract(content)
                .tags
                .asSequence()
                .map(String::trim)
                .filter(String::isNotBlank)
                .map(String::lowercase)
                .distinct()
                .toList()

        return PersistedFeatureSnapshot(
            version = SNAPSHOT_VERSION,
            postVersion = post.version,
            modifiedAtEpochMs = post.modifiedAt.toEpochMilli(),
            hitCount = post.hitCount.coerceAtLeast(0),
            likesCount = post.likesCount.coerceAtLeast(0),
            contentLength = content.length,
            contentHash = content.hashCode(),
            dwellProxySeconds = estimateDwellProxySeconds(content),
            normalizedTags = normalizedTags,
            capturedAtEpochMs = nowEpochMs,
        )
    }

    private fun PersistedFeatureSnapshot.toFeatureVector(post: Post): RecommendFeatureVector =
        RecommendFeatureVector(
            hitCount = post.hitCount.coerceAtLeast(0),
            likesCount = post.likesCount.coerceAtLeast(0),
            dwellProxySeconds = dwellProxySeconds,
            normalizedTags = normalizedTags,
        )

    private fun estimateDwellProxySeconds(content: String): Double {
        val normalizedLength = content.length.coerceAtLeast(0)
        if (normalizedLength == 0) return 20.0
        return (normalizedLength.toDouble() / 22.0).coerceIn(20.0, 420.0)
    }

    companion object {
        private const val FEATURE_STORE_ATTR_NAME = "recommendFeatureStoreV1"
        private const val SNAPSHOT_VERSION = 3
        private const val MAX_LOCAL_CACHE_ENTRIES = 2_048
    }
}
