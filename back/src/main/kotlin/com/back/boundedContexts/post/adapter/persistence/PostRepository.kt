package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import org.springframework.data.jpa.repository.JpaRepository

interface PostRepository :
    JpaRepository<Post, Int>,
    PostRepositoryCustom {
    fun existsByAuthorAndTitle(
        author: Member,
        title: String,
    ): Boolean

    fun existsByIdAndContentContaining(
        id: Int,
        contentFragment: String,
    ): Boolean

    fun existsByContentContaining(contentFragment: String): Boolean

    fun findFirstByOrderByIdDesc(): Post?

    fun findFirstByAuthorAndTitleAndPublishedFalseOrderByIdAsc(
        author: Member,
        title: String,
    ): Post?
}
