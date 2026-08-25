package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.output.PostTagIndexRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.PostMetaExtractor
import com.back.boundedContexts.post.dto.TagCountDto
import org.springframework.stereotype.Service

@Service
class PostTagIndexService(
    private val postTagIndexRepository: PostTagIndexRepositoryPort,
) {
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

    private fun normalizeTag(tag: String): String = tag.trim()
}
