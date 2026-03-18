package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.standard.extensions.getOrThrow
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * PostPublicReadQueryService는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
@Service
class PostPublicReadQueryService(
    private val postUseCase: PostUseCase,
) {
    @Transactional(readOnly = true)
    fun getPublicPostDetail(id: Int): PostWithContentDto {
        val post = postUseCase.findById(id).getOrThrow()
        post.checkActorCanRead(null)
        return PostWithContentDto(post)
    }

    @Transactional(readOnly = true)
    fun getPublicTagCounts(): List<TagCountDto> = postUseCase.getPublicTagCounts()
}
