package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import java.time.Instant

/**
 * `PostRepositoryCustom` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
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

    fun findPublicDetailById(id: Long): Post?

    fun findAllPublicListedContents(): List<String>

    fun findAllPublicListedTagIndexes(tagIndexAttrName: String): List<String>
}
