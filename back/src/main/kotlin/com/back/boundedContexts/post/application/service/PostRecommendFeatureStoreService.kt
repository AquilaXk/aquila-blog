package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.dto.PostMetaExtractor
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import tools.jackson.databind.ObjectMapper
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
        val commentsCount: Int,
        val dwellProxySeconds: Double,
        val normalizedTags: List<String>,
    )

    private data class PersistedFeatureSnapshot(
        val version: Int,
        val hitCount: Int,
        val likesCount: Int,
        val commentsCount: Int,
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

    fun resolveForPosts(posts: List<Post>): Map<Long, RecommendFeatureVector> {
        if (posts.isEmpty()) return emptyMap()
        if (!enabled) {
            return posts.associate { post -> post.id to buildSnapshot(post).toFeatureVector(post) }
        }

        val attrByPostId =
            postAttrRepository
                .findBySubjectInAndNameIn(posts, listOf(FEATURE_STORE_ATTR_NAME))
                .associateBy { it.subject.id }

        return posts.associate { post ->
            post.id to resolveFeature(post, attrByPostId[post.id])
        }
    }

    fun refresh(post: Post) {
        if (!enabled) return
        val snapshot = buildSnapshot(post)
        persistSnapshot(post, snapshot)
        cacheSnapshot(post.id, snapshot)
    }

    fun evict(postId: Long) {
        localCache.remove(postId)
    }

    private fun resolveFeature(
        post: Post,
        persistedAttr: PostAttr?,
    ): RecommendFeatureVector {
        val now = System.currentTimeMillis()
        val cachedSnapshot =
            localCache[post.id]
                ?.takeIf { it.expiresAtEpochMs > now }
                ?.snapshot

        if (cachedSnapshot != null && !isSnapshotStale(cachedSnapshot, now) && matchesPost(post, cachedSnapshot)) {
            return cachedSnapshot.toFeatureVector(post)
        }

        val persistedSnapshot =
            persistedAttr
                ?.strValue
                ?.let(::parsePersistedSnapshot)
                ?.takeIf { !isSnapshotStale(it, now) && matchesPost(post, it) }

        if (persistedSnapshot != null) {
            cacheSnapshot(post.id, persistedSnapshot)
            return persistedSnapshot.toFeatureVector(post)
        }

        val rebuilt = buildSnapshot(post)
        persistSnapshot(post, rebuilt)
        cacheSnapshot(post.id, rebuilt)
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
    ) {
        val expiresAt = System.currentTimeMillis() + localCacheTtlMillis
        localCache[postId] = LocalCacheEntry(expiresAt, snapshot)
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
            snapshot.contentLength == content.length &&
            snapshot.contentHash == content.hashCode()
    }

    private fun buildSnapshot(post: Post): PersistedFeatureSnapshot {
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
            hitCount = post.hitCount.coerceAtLeast(0),
            likesCount = post.likesCount.coerceAtLeast(0),
            commentsCount = post.commentsCount.coerceAtLeast(0),
            contentLength = content.length,
            contentHash = content.hashCode(),
            dwellProxySeconds = estimateDwellProxySeconds(content),
            normalizedTags = normalizedTags,
            capturedAtEpochMs = System.currentTimeMillis(),
        )
    }

    private fun PersistedFeatureSnapshot.toFeatureVector(post: Post): RecommendFeatureVector =
        RecommendFeatureVector(
            hitCount = post.hitCount.coerceAtLeast(0),
            likesCount = post.likesCount.coerceAtLeast(0),
            commentsCount = post.commentsCount.coerceAtLeast(0),
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
        private const val SNAPSHOT_VERSION = 1
    }
}
