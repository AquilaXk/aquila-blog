package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.application.port.output.PostTagIndexRepositoryPort
import com.back.boundedContexts.post.dto.PostMetaExtractor
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * PostSearchIndexSyncService는 post_tag_index 보조 인덱스를 비동기로 재동기화합니다.
 * 쓰기 경로 인라인 동기화 실패/지연 상황을 작업 큐 재시도로 완화해 검색 안정성을 높입니다.
 */
@Service
class PostSearchIndexSyncService(
    private val postUseCase: PostUseCase,
    private val postTagIndexRepository: PostTagIndexRepositoryPort,
    @Value("\${custom.post.search-index.max-tags:32}")
    maxTags: Int,
) {
    private val logger = LoggerFactory.getLogger(PostSearchIndexSyncService::class.java)
    private val safeMaxTags = maxTags.coerceIn(1, 128)

    /**
     * sync 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * forceClear=true면 인덱스를 즉시 비우고, 그렇지 않으면 DB 본문 태그 우선으로 재구성합니다.
     */
    @Transactional
    fun sync(
        postId: Long,
        fallbackTags: List<String>,
        forceClear: Boolean,
    ) {
        if (forceClear) {
            postTagIndexRepository.replacePostTags(postId, emptyList())
            return
        }

        val dbTags =
            postUseCase
                .findById(postId)
                ?.let { post ->
                    normalizeTags(PostMetaExtractor.extract(post.content).tags)
                }.orEmpty()
        val normalizedFallbackTags = normalizeTags(fallbackTags)
        val targetTags = if (dbTags.isNotEmpty()) dbTags else normalizedFallbackTags

        postTagIndexRepository.replacePostTags(postId, targetTags)
        logger.debug(
            "post_search_index_sync_done postId={} dbTags={} fallbackTags={} targetTags={}",
            postId,
            dbTags.size,
            normalizedFallbackTags.size,
            targetTags.size,
        )
    }

    private fun normalizeTags(tags: Collection<String>): List<String> =
        tags
            .asSequence()
            .map(String::trim)
            .filter(String::isNotBlank)
            .map { it.take(64) }
            .distinct()
            .take(safeMaxTags)
            .toList()
}
