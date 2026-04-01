package com.back.boundedContexts.post.application.port.input

import com.back.boundedContexts.post.dto.CursorFeedPageDto
import com.back.boundedContexts.post.dto.FeedPostDto
import com.back.boundedContexts.post.dto.PostWithContentDto
import com.back.boundedContexts.post.dto.TagCountDto
import com.back.standard.dto.page.PageDto
import com.back.standard.dto.post.type1.PostSearchSortType1

interface PostPublicReadQueryUseCase {
    fun getPublicFeed(
        page: Int,
        pageSize: Int,
        sort: PostSearchSortType1,
    ): PageDto<FeedPostDto>

    fun getPublicFeedByCursor(
        cursor: String?,
        pageSize: Int,
        sort: PostSearchSortType1,
    ): CursorFeedPageDto

    fun getPublicExplore(
        page: Int,
        pageSize: Int,
        kw: String,
        tag: String,
        sort: PostSearchSortType1,
    ): PageDto<FeedPostDto>

    fun getPublicExploreByCursor(
        cursor: String?,
        pageSize: Int,
        tag: String,
        sort: PostSearchSortType1,
    ): CursorFeedPageDto

    fun getPublicSearch(
        page: Int,
        pageSize: Int,
        kw: String,
        sort: PostSearchSortType1,
    ): PageDto<FeedPostDto>

    fun getPublicPostDetail(id: Long): PostWithContentDto

    fun getPublicRelatedByAuthor(
        authorId: Long,
        excludePostId: Long?,
        limit: Int,
    ): List<FeedPostDto>

    fun getPublicTagCounts(): List<TagCountDto>
}
