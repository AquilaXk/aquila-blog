package com.back.boundedContexts.post.application.port.input

import com.back.boundedContexts.post.dto.PostDto
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.post.type1.PostSearchSortType1

interface AdminPostListSnapshotUseCase {
    fun getFirstPageSnapshot(sort: PostSearchSortType1 = PostSearchSortType1.CREATED_AT): PageDto<PostDto>
}
