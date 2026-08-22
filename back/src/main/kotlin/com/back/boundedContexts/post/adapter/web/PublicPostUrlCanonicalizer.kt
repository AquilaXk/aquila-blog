package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.dto.CursorFeedPageDto
import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.boundedContexts.post.dto.PublicPostsBootstrapDto
import com.back.global.storage.application.UploadedFileUrlCodec
import com.back.standard.dto.page.PageDto

object PublicPostUrlCanonicalizer {
    fun canonicalizeFeedPage(page: PageDto<FeedPostDto>): PageDto<FeedPostDto> = page.copy(content = canonicalizeFeedPosts(page.content))

    fun canonicalizePostPage(page: PageDto<PostDto>): PageDto<PostDto> = page.copy(content = page.content.map(::canonicalizePost))

    fun canonicalizeCursorFeedPage(page: CursorFeedPageDto): CursorFeedPageDto = page.copy(content = canonicalizeFeedPosts(page.content))

    fun canonicalizeBootstrap(bootstrap: PublicPostsBootstrapDto): PublicPostsBootstrapDto =
        bootstrap.copy(feed = canonicalizeCursorFeedPage(bootstrap.feed))

    fun canonicalizeFeedPosts(posts: List<FeedPostDto>): List<FeedPostDto> = posts.map(::canonicalizeFeedPost)

    fun canonicalizeFeedPost(post: FeedPostDto): FeedPostDto =
        post.copy(
            authorProfileImgUrl = UploadedFileUrlCodec.canonicalizePublicStorageUrl(post.authorProfileImgUrl),
            thumbnail = post.thumbnail?.let(UploadedFileUrlCodec::canonicalizePublicStorageUrl),
        )

    fun canonicalizePost(post: PostDto): PostDto =
        post.copy(
            authorProfileImgUrl = UploadedFileUrlCodec.canonicalizePublicStorageUrl(post.authorProfileImgUrl),
            thumbnail = post.thumbnail?.let(UploadedFileUrlCodec::canonicalizePublicStorageUrl),
        )

    fun canonicalizePostWithContent(post: PostWithContentDto): PostWithContentDto =
        post.copy(
            authorProfileImageDirectUrl = UploadedFileUrlCodec.canonicalizePublicStorageUrl(post.authorProfileImageDirectUrl),
            content = UploadedFileUrlCodec.canonicalizePublicStorageContent(post.content),
            contentHtml = post.contentHtml?.let(UploadedFileUrlCodec::canonicalizePublicStorageContent),
        )
}
