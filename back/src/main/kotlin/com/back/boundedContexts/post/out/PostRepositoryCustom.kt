package com.back.boundedContexts.post.out

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable

interface PostRepositoryCustom {
    fun findQPagedByKw(kw: String, pageable: Pageable): Page<Post>
    fun findQPagedByAuthorAndKw(author: Member, kw: String, pageable: Pageable): Page<Post>
}
