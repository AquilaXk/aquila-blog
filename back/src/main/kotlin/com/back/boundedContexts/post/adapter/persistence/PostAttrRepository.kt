package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import org.springframework.data.jpa.repository.JpaRepository

interface PostAttrRepository :
    JpaRepository<PostAttr, Int>,
    PostAttrRepositoryCustom {
    fun deleteBySubject(subject: Post)
}
