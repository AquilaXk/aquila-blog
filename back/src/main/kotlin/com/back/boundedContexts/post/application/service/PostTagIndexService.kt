package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostTagIndexRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.domain.postMixin.META_TAGS_INDEX
import com.back.boundedContexts.post.dto.PostMetaExtractor
import com.back.boundedContexts.post.dto.TagCountDto
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service

@Service
class PostTagIndexService(
    private val postTagIndexRepository: PostTagIndexRepositoryPort,
    private val postAttrRepository: PostAttrRepositoryPort,
) {
    private val logger = LoggerFactory.getLogger(PostTagIndexService::class.java)

    fun getPublicTagCounts(): List<TagCountDto> =
        postTagIndexRepository.findAllPublicTagCounts().map { row ->
            TagCountDto(row.tag, row.count)
        }

    fun syncMetaTagIndexAttr(post: Post) {
        val normalizedTags = extractNormalizedTags(post.content)

        val indexValue =
            if (normalizedTags.isEmpty()) {
                ""
            } else {
                normalizedTags.joinToString(separator = "|", prefix = "|", postfix = "|")
            }

        val tagIndexAttr = postAttrRepository.findBySubjectAndName(post, META_TAGS_INDEX) ?: PostAttr(0, post, META_TAGS_INDEX, "")
        if ((tagIndexAttr.strValue ?: "") != indexValue) {
            tagIndexAttr.strValue = indexValue
            postAttrRepository.save(tagIndexAttr)
        }

        runCatching {
            postTagIndexRepository.replacePostTags(post.id, normalizedTags)
        }.onFailure { exception ->
            logger.warn("failed_to_sync_post_tag_index postId={}", post.id, exception)
        }
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
