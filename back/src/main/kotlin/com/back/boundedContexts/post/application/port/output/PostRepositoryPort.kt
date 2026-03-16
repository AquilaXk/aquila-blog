package com.back.boundedContexts.post.application.port.output

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.AdmDeletedPostDto
import com.back.boundedContexts.post.dto.AdmDeletedPostSnapshotDto
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import java.util.Optional

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
