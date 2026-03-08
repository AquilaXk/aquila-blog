package com.back.boundedContexts.post.out

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import org.springframework.data.jpa.repository.JpaRepository

interface PostRepository : JpaRepository<Post, Int>, PostRepositoryCustom {
    fun findFirstByOrderByIdDesc(): Post?
    fun findFirstByAuthorAndTitleAndPublishedFalseOrderByIdAsc(author: Member, title: String): Post?
}
