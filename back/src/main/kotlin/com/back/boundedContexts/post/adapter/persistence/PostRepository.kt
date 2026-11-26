package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import jakarta.persistence.LockModeType
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.util.Optional

interface PostRepository :
    JpaRepository<Post, Long>,
    PostRepositoryCustom {
    fun countByAuthor(author: Member): Long

    fun existsByIdAndPublishedTrue(id: Long): Boolean

    fun existsByAuthorAndTitle(
        author: Member,
        title: String,
    ): Boolean

    fun findFirstByOrderByIdDesc(): Post?

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select post from Post post where post.id = :id")
    fun findByIdForUpdate(
        @Param("id") id: Long,
    ): Optional<Post>
}
