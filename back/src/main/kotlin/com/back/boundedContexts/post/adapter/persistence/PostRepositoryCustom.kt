package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.PublicPostDetailContentCacheDto
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import java.time.Instant

interface PostRepositoryCustom {
    fun findQPagedByKw(
        kw: String,
        pageable: Pageable,
    ): Page<Post>

    fun findQPagedByKwForAdmin(
        kw: String,
        pageable: Pageable,
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
        cursorCreatedAt: Instant?,
        cursorId: Long?,
        limit: Int,
        sortAscending: Boolean,
    ): List<Post>

    fun findPublicByTagCursor(
        tag: String,
        cursorCreatedAt: Instant?,
        cursorId: Long?,
        limit: Int,
        sortAscending: Boolean,
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
}
