package com.back.boundedContexts.post.application.port.output

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.AdmDeletedPostDto
import com.back.boundedContexts.post.dto.AdmDeletedPostSnapshotDto
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import java.util.Optional

/**
 * `PostRepositoryPort` 인터페이스입니다.
 * - 역할: 계층 간 계약(포트/스펙) 정의를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
interface PostRepositoryPort {
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

    fun findQPagedByKw(
        kw: String,
        pageable: Pageable,
    ): Page<Post>

    fun findQPagedByKwForAdmin(
        kw: String,
        pageable: Pageable,
    ): Page<Post>

    fun findDeletedPagedByKw(
        kw: String,
        pageable: Pageable,
    ): Page<AdmDeletedPostDto>

    fun findDeletedSnapshotById(id: Int): AdmDeletedPostSnapshotDto?

    fun softDeleteById(id: Int): Boolean

    fun restoreDeletedById(id: Int): Boolean

    fun hardDeleteDeletedById(id: Int): Boolean

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

    fun findAllPublicListedContents(): List<String>

    fun findAllPublicListedTagIndexes(tagIndexAttrName: String): List<String>

    fun existsByIdAndContentContaining(
        id: Int,
        contentFragment: String,
    ): Boolean

    fun existsByContentContaining(contentFragment: String): Boolean
}
