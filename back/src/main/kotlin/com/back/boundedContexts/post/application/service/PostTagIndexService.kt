package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.output.PostAttrRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostTagIndexRepositoryPort
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.domain.postMixin.META_TAGS_INDEX
import com.back.boundedContexts.post.dto.PostMetaExtractor
import com.back.boundedContexts.post.dto.TagCountDto
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.util.concurrent.ConcurrentHashMap

@Service
class PostTagIndexService(
    private val postRepository: PostRepositoryPort,
    private val postTagIndexRepository: PostTagIndexRepositoryPort,
    private val postAttrRepository: PostAttrRepositoryPort,
    @param:Value("\${custom.post.read.tags-local-cache-ttl-seconds:180}")
    tagsLocalCacheTtlSeconds: Long,
) {
    private val logger = LoggerFactory.getLogger(PostTagIndexService::class.java)

    private data class TagCountsCache(
        val expiresAtMillis: Long,
        val values: List<TagCountDto>,
    )

    @Volatile
    private var publicTagCountsCache: TagCountsCache? = null

    private val tagCacheTtlMillis: Long = tagsLocalCacheTtlSeconds.coerceAtLeast(5) * 1_000

    fun getPublicTagCounts(): List<TagCountDto> {
        val now = System.currentTimeMillis()
        publicTagCountsCache?.takeIf { it.expiresAtMillis > now }?.let { return it.values }

        synchronized(this) {
            val refreshedNow = System.currentTimeMillis()
            publicTagCountsCache?.takeIf { it.expiresAtMillis > refreshedNow }?.let { return it.values }

            val result =
                runCatching {
                    postTagIndexRepository.findAllPublicTagCounts().map { row ->
                        TagCountDto(row.tag, row.count)
                    }
                }.getOrElse { exception ->
                    logger.warn(
                        "public_tag_counts_query_failed: fallback to legacy metaTagsIndex path",
                        exception,
                    )
                    loadPublicTagCountsFromMetaTagIndex()
                }

            publicTagCountsCache = TagCountsCache(refreshedNow + tagCacheTtlMillis, result)
            return result
        }
    }

    fun evictPublicTagCountsCache() {
        publicTagCountsCache = null
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

    private fun loadPublicTagCountsFromMetaTagIndex(): List<TagCountDto> {
        val tagCounts = ConcurrentHashMap<String, Int>()
        val indexedTagRows = postRepository.findAllPublicListedTagIndexes(META_TAGS_INDEX)

        indexedTagRows.forEach { tagIndex ->
            parseTagIndex(tagIndex).forEach { normalizedTag ->
                tagCounts.merge(normalizedTag, 1, Int::plus)
            }
        }

        if (indexedTagRows.isEmpty()) {
            logger.warn(
                "public_tag_counts_index_empty: skip legacy content-scan fallback to protect DB under load",
            )
        }

        return tagCounts
            .entries
            .sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key.lowercase() })
            .map { TagCountDto(it.key, it.value) }
    }

    private fun normalizeTag(tag: String): String = tag.trim()

    private fun parseTagIndex(tagIndex: String): List<String> =
        tagIndex
            .split('|')
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
}
