package com.back.boundedContexts.post.application.port.output

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import java.util.Optional

interface PostRepositoryPort {
    fun count(): Long

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

    fun findQPagedByAuthorAndKw(
        author: Member,
        kw: String,
        pageable: Pageable,
    ): Page<Post>

    fun existsByIdAndContentContaining(
        id: Int,
        contentFragment: String,
    ): Boolean

    fun existsByContentContaining(contentFragment: String): Boolean
}
