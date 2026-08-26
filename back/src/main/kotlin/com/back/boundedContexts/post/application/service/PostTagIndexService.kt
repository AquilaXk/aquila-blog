package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.output.PostTagIndexRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.PostMetaExtractor
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import org.springframework.stereotype.Service

@Service
class PostTagIndexService(
    private val postTagIndexRepository: PostTagIndexRepositoryPort,
) {
    companion object {
        private const val MAX_TAG_LENGTH = 80
    }

    fun getPublicTagCounts(): List<TagCountDto> =
        postTagIndexRepository.findAllPublicTagCounts().map { row ->
            TagCountDto(row.tag, row.count)
        }

    fun syncPostTags(post: Post) {
        val normalizedTags = extractNormalizedTags(post.content)
        postTagIndexRepository.replacePostTags(post.id, normalizedTags)
    }

    fun extractNormalizedTags(content: String): List<String> =
        PostMetaExtractor
            .extract(content)
            .tags
            .map(::normalizeTag)
            .filter(String::isNotBlank)
            .distinct()

    private fun normalizeTag(tag: String): String =
        tag.trim().also { normalizedTag ->
            if (normalizedTag.codePointCount(0, normalizedTag.length) > MAX_TAG_LENGTH) {
                throw AppException(ErrorCode.BAD_REQUEST, "태그는 최대 ${MAX_TAG_LENGTH}자까지 입력할 수 있습니다.")
            }
        }
}
