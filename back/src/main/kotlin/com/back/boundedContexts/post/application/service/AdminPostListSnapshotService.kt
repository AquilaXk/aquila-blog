package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.input.AdminPostListSnapshotUseCase
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.dto.PostDto
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.post.type1.PostSearchSortType1
import org.springframework.cache.annotation.Cacheable
import org.springframework.stereotype.Service

@Service
class AdminPostListSnapshotService(
    private val postUseCase: PostUseCase,
) : AdminPostListSnapshotUseCase {
    @Cacheable(
        cacheNames = [PostQueryCacheNames.ADMIN_POSTS_FIRST_PAGE],
        key = "'page=1:size=20:sort=' + #sort.name()",
        sync = true,
    )
    override fun getFirstPageSnapshot(sort: PostSearchSortType1): PageDto<PostDto> {
        val postPage = postUseCase.findPagedByKwForAdmin("", sort, 1, 20)
        return PageDto(
            postPage.map { post ->
                PostDto(post).apply {
                    tempDraft = postUseCase.isTempDraft(post)
                }
            },
        )
    }
}
