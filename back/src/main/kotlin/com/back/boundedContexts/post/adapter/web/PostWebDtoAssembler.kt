package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.boundedContexts.post.model.Post
import com.back.global.web.application.Rq
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.page.PagedResult
import org.springframework.stereotype.Component

@Component
class PostWebDtoAssembler(
    private val postUseCase: PostUseCase,
    private val rq: Rq,
) {
    fun makePostDtoPage(postPage: PagedResult<Post>): PageDto<PostDto> {
        val actor = rq.actorOrNull
        val likedPostIds = postUseCase.findLikedPostIds(actor, postPage.content)

        return PageDto(
            postPage.map { post ->
                PostDto(post).apply {
                    actorHasLiked = post.id in likedPostIds
                }
            },
        )
    }

    fun makePostWithContentDto(post: Post): PostWithContentDto {
        val actor = rq.actorOrNull
        val hasAdminRole = rq.hasRole("ADMIN")
        return PostWithContentDto(post).apply {
            tempDraft = postUseCase.isTempDraft(post)
            actorHasLiked = postUseCase.isLiked(post, actor)
            actorCanModify = hasAdminRole || post.getCheckActorCanModifyRs(actor).isSuccess
            actorCanDelete = hasAdminRole || post.getCheckActorCanDeleteRs(actor).isSuccess
        }
    }

    fun makePostWriteResultDto(post: Post): PostWriteResultDto =
        PostWriteResultDto(
            id = post.id,
            title = post.title,
            version = post.version ?: 0L,
            published = post.published,
            listed = post.listed,
        )
}
