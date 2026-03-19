package com.back.boundedContexts.post.application.port.output

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.AdmDeletedPostDto
import com.back.boundedContexts.post.dto.AdmDeletedPostSnapshotDto
import java.util.Optional

/**
 * `PostRepositoryPort` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
interface PostRepositoryPort {
    data class PagedQuery(
        val kw: String,
        val zeroBasedPage: Int,
        val pageSize: Int,
        val sortProperty: String,
        val sortAscending: Boolean,
    )

    data class TaggedPagedQuery(
        val kw: String,
        val tag: String,
        val zeroBasedPage: Int,
        val pageSize: Int,
        val sortProperty: String,
        val sortAscending: Boolean,
    )

    data class DeletedPagedQuery(
        val kw: String,
        val zeroBasedPage: Int,
        val pageSize: Int,
    )

    data class PagedResult<T>(
        val content: List<T>,
        val totalElements: Long,
    )

    fun count(): Long

    fun countByAuthor(author: Member): Long

    fun save(post: Post): Post

    fun saveAndFlush(post: Post): Post

    fun flush()

    fun findById(id: Int): Optional<Post>

    fun findFirstByOrderByIdDesc(): Post?

    fun findFirstByAuthorAndTitleAndPublishedFalseOrderByIdAsc(
        author: Member,
        title: String,
    ): Post?

    fun existsByAuthorAndTitle(
        author: Member,
        title: String,
    ): Boolean

    fun findQPagedByKw(query: PagedQuery): PagedResult<Post>

    fun findQPagedByKwForAdmin(query: PagedQuery): PagedResult<Post>

    fun findDeletedPagedByKw(query: DeletedPagedQuery): PagedResult<AdmDeletedPostDto>

    fun findDeletedSnapshotById(id: Int): AdmDeletedPostSnapshotDto?

    fun softDeleteById(id: Int): Boolean

    fun restoreDeletedById(id: Int): Boolean

    fun hardDeleteDeletedById(id: Int): Boolean

    fun findQPagedByAuthorAndKw(
        author: Member,
        query: PagedQuery,
    ): PagedResult<Post>

    fun findQPagedByKwAndTag(query: TaggedPagedQuery): PagedResult<Post>

    fun findAllPublicListedContents(): List<String>

    fun findAllPublicListedTagIndexes(tagIndexAttrName: String): List<String>

    fun existsByIdAndContentContaining(
        id: Int,
        contentFragment: String,
    ): Boolean

    fun existsByContentContaining(contentFragment: String): Boolean
}
