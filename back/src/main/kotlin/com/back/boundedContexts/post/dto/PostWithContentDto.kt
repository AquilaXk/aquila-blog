package com.back.boundedContexts.post.dto

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.model.PostSummarySource
import com.back.global.security.application.ContentHtmlTrustResult
import com.back.global.security.application.ContentHtmlTrustState
import com.back.global.security.application.HtmlContentSanitizer
import io.swagger.v3.oas.annotations.media.Schema
import java.time.Instant

data class PostWithContentDto(
    val id: Long,
    val createdAt: Instant,
    val modifiedAt: Instant,
    val authorId: Long,
    val authorName: String,
    val authorUsername: String,
    val authorProfileImageUrl: String,
    val authorProfileImageDirectUrl: String,
    val title: String,
    val content: String,
    val contentHtml: String?,
    val version: Long,
    val published: Boolean,
    val listed: Boolean,
    var tempDraft: Boolean = false,
    val likesCount: Int,
    val commentsCount: Int,
    val hitCount: Int,
    var actorHasLiked: Boolean = false,
    var actorCanModify: Boolean = false,
    var actorCanDelete: Boolean = false,
    val summary: String = "",
    val summarySource: PostSummarySource = PostSummarySource.NONE,
    val contentHtmlHash: String? = null,
    @field:Schema(allowableValues = [HtmlContentSanitizer.CURRENT_POLICY_VERSION])
    val contentHtmlSanitizerPolicyVersion: String? = null,
    val contentHtmlTrustState: ContentHtmlTrustState = ContentHtmlTrustState.UNKNOWN,
) {
    private constructor(post: Post, contentHtmlTrust: ContentHtmlTrustResult) : this(
        post.id,
        post.createdAt,
        post.modifiedAt,
        post.author.id,
        post.author.name,
        post.author.name,
        post.author.redirectToProfileImgUrlVersionedOrDefault,
        post.author.profileImgUrlVersionedOrDefault,
        post.title,
        post.content,
        contentHtmlTrust.contentHtml,
        post.version ?: 0L,
        post.published,
        post.listed,
        false,
        post.likesCount,
        post.commentsCount,
        post.hitCount,
        summary = post.summaryText.orEmpty(),
        summarySource = post.summarySource,
        contentHtmlHash = contentHtmlTrust.contentHtmlHash,
        contentHtmlSanitizerPolicyVersion = contentHtmlTrust.contentHtmlSanitizerPolicyVersion,
        contentHtmlTrustState = contentHtmlTrust.contentHtmlTrustState,
    )

    constructor(post: Post) : this(
        post,
        HtmlContentSanitizer.verifyStored(
            post.contentHtml,
            post.contentHtmlHash,
            post.contentHtmlSanitizerPolicyVersion,
            post.contentHtmlTrustState,
        ),
    )
}
