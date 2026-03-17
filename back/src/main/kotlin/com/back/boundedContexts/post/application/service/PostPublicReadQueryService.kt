package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.standard.extensions.getOrThrow
import org.springframework.cache.annotation.Cacheable
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class PostPublicReadQueryService(
    private val postUseCase: PostUseCase,
) {
    @Transactional(readOnly = true)
    @Cacheable(cacheNames = [PostQueryCacheNames.DETAIL_PUBLIC], key = "#id")
    fun getPublicPostDetail(id: Int): PostWithContentDto {
        val post = postUseCase.findById(id).getOrThrow()
        post.checkActorCanRead(null)
        return PostWithContentDto(post)
    }

    @Transactional(readOnly = true)
    @Cacheable(cacheNames = [PostQueryCacheNames.TAGS], key = "'all'")
    fun getPublicTagCounts(): List<TagCountDto> = postUseCase.getPublicTagCounts()
}
