package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.output.PostTagIndexRepositoryPort
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * PostSearchIndexSyncService는 post_tag_index 보조 인덱스를 비동기로 재동기화합니다.
 * 쓰기 경로 인라인 동기화 실패/지연 상황을 작업 큐 재시도로 완화해 검색 안정성을 높입니다.
 */
@Service
class PostSearchIndexSyncService(
    private val postTagIndexRepository: PostTagIndexRepositoryPort,
    private val postTagIndexService: PostTagIndexService,
) {
    @Transactional
    fun sync(postId: Long) {
        val source = postTagIndexRepository.findPostSourceForUpdate(postId)
        val targetTags =
            source
                ?.takeUnless { it.deleted }
                ?.let { postTagIndexService.extractNormalizedTags(it.content) }
                ?: emptyList()
        postTagIndexRepository.replacePostTags(postId, targetTags)
    }
}
