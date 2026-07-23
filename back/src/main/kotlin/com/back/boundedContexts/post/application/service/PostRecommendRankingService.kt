package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.standard.dto.page.PagedResult
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.time.Duration
import java.time.Instant
import kotlin.math.ln
import kotlin.math.max

/**
 * PostRecommendRankingService는 explore 기본 경로의 추천 랭킹 파이프라인을 전담한다.
 * 신선도/클릭/참여/체류 프록시/태그 유사도를 조합해 후보군을 재정렬한다.
 */
@Service
class PostRecommendRankingService(
    private val postRecommendFeatureStoreService: PostRecommendFeatureStoreService,
    @Value("\${custom.post.recommend.enabled:true}")
    enabled: Boolean,
    @Value("\${custom.post.recommend.candidatePoolSize:240}")
    candidatePoolSize: Int,
    @Value("\${custom.post.recommend.maxRerankPages:4}")
    maxRerankPages: Int,
    @Value("\${custom.post.recommend.hotTagsLimit:24}")
    hotTagsLimit: Int,
) {
    private val enabled = enabled
    private val candidatePoolSize = candidatePoolSize.coerceIn(60, 600)
    private val maxRerankPages = maxRerankPages.coerceIn(1, 12)
    private val hotTagsLimit = hotTagsLimit.coerceIn(5, 64)

    private data class RankedPost(
        val post: Post,
        val score: Double,
    )

    fun isEnabledForPage(page: Int): Boolean = enabled && page in 1..maxRerankPages

    fun resolveCandidatePoolSize(pageSize: Int): Int {
        val safePageSize = pageSize.coerceIn(1, 100)
        return max(candidatePoolSize, safePageSize * maxRerankPages).coerceIn(safePageSize, 600)
    }

    fun rerank(
        candidates: List<Post>,
        tagCounts: List<TagCountDto>,
        page: Int,
        pageSize: Int,
        candidateTotalElements: Long,
    ): PagedResult<Post> {
        val safePage = page.coerceAtLeast(1)
        val safePageSize = pageSize.coerceIn(1, 100)
        if (candidates.isEmpty()) {
            return PagedResult(
                content = emptyList(),
                page = safePage,
                pageSize = safePageSize,
                totalElements = 0,
            )
        }

        val tagWeights = buildHotTagWeights(tagCounts)
        val featureStore = postRecommendFeatureStoreService.resolveForPosts(candidates)
        val ranked =
            candidates
                .asSequence()
                .map { post ->
                    val feature =
                        featureStore[post.id]
                            ?: PostRecommendFeatureStoreService.RecommendFeatureVector(
                                hitCount = post.hitCount.coerceAtLeast(0),
                                likesCount = post.likesCount.coerceAtLeast(0),
                                commentsCount = post.commentsCount.coerceAtLeast(0),
                                dwellProxySeconds = 20.0,
                                normalizedTags = emptyList(),
                            )
                    RankedPost(post, scoreRecommendedPost(post, feature, tagWeights))
                }.sortedWith(
                    compareByDescending<RankedPost> { it.score }
                        .thenByDescending { it.post.createdAt }
                        .thenByDescending { it.post.id },
                ).map {
                    it.post
                }.toList()

        val fromIndex = ((safePage - 1) * safePageSize).coerceAtLeast(0)
        val toIndex = minOf(fromIndex + safePageSize, ranked.size)
        val content = if (fromIndex >= ranked.size) emptyList() else ranked.subList(fromIndex, toIndex)
        val totalElements = max(candidateTotalElements, ranked.size.toLong())

        return PagedResult(
            content = content,
            page = safePage,
            pageSize = safePageSize,
            totalElements = totalElements,
        )
    }

    private fun buildHotTagWeights(tagCounts: List<TagCountDto>): Map<String, Double> {
        if (tagCounts.isEmpty()) return emptyMap()

        val topTags = tagCounts.take(hotTagsLimit)
        if (topTags.isEmpty()) return emptyMap()

        val maxCount = topTags.maxOfOrNull { it.count }?.toDouble()?.coerceAtLeast(1.0) ?: 1.0
        val total = topTags.size.coerceAtLeast(1)

        return topTags
            .mapIndexed { index, dto ->
                val normalizedTag = dto.tag.trim().lowercase()
                val rankWeight = ((total - index).toDouble() / total).coerceIn(0.0, 1.0)
                val volumeWeight = (dto.count.toDouble() / maxCount).coerceIn(0.0, 1.0)
                normalizedTag to (rankWeight * 0.65 + volumeWeight * 0.35)
            }.toMap()
    }

    private fun scoreRecommendedPost(
        post: Post,
        feature: PostRecommendFeatureStoreService.RecommendFeatureVector,
        tagWeights: Map<String, Double>,
    ): Double {
        val now = Instant.now()
        val ageHours = Duration.between(post.createdAt, now).toHours().coerceAtLeast(0)
        val freshnessScore =
            when {
                ageHours <= 6 -> 120.0
                ageHours <= 24 -> 98.0
                ageHours <= 72 -> 75.0
                ageHours <= 168 -> 48.0
                ageHours <= 336 -> 24.0
                else -> 10.0
            }

        val clickScore = ln(feature.hitCount.toDouble() + 1.0) * 22.0
        val engagementSignal = (feature.likesCount * 2) + (feature.commentsCount * 3)
        val engagementScore = ln(engagementSignal.toDouble() + 1.0) * 18.0
        val dwellScore = ln(feature.dwellProxySeconds + 1.0) * 9.0

        val matchedWeight = feature.normalizedTags.sumOf { tagWeights[it] ?: 0.0 }
        val tagSimilarityScore =
            if (feature.normalizedTags.isEmpty() || matchedWeight <= 0.0) {
                0.0
            } else {
                (matchedWeight / feature.normalizedTags.size.toDouble()) * 65.0
            }

        return freshnessScore + clickScore + engagementScore + dwellScore + tagSimilarityScore
    }
}
