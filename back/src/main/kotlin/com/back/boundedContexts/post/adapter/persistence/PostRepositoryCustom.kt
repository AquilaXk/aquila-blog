package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.PublicPostDetailContentCacheDto
import com.back.standard.dto.post.type1.PostSearchSortType1
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable

interface PostRepositoryCustom {
    fun findQPagedByKw(
        kw: String,
        pageable: Pageable,
    ): Page<Post>

    fun findQPagedByKwForAdmin(
        kw: String,
        pageable: Pageable,
        status: String,
    ): Page<Post>

    fun findQPagedByAuthorAndKw(
        author: Member,
        kw: String,
        pageable: Pageable,
    ): Page<Post>

    fun findQPagedByKwAndTag(
        kw: String,
        tag: String,
        pageable: Pageable,
    ): Page<Post>

    fun findPublicByCursor(
        cursorSortValue: Long?,
        cursorId: Long?,
        limit: Int,
        sort: PostSearchSortType1,
    ): List<Post>

    fun findPublicByTagCursor(
        tag: String,
        cursorSortValue: Long?,
        cursorId: Long?,
        limit: Int,
        sort: PostSearchSortType1,
    ): List<Post>

    fun findPublicByAuthorExceptPost(
        authorId: Long,
        excludePostId: Long?,
        limit: Int,
    ): List<Post>

    fun findPublicDetailById(id: Long): Post?

    fun findPublicDetailContentById(id: Long): PublicPostDetailContentCacheDto?

    fun findAllPublicListedContents(): List<String>

    fun findAllPublicListedTagIndexes(tagIndexAttrName: String): List<String>

    fun findActiveByAuthorIdOrderByIdAsc(authorId: Long): List<Post>
}
