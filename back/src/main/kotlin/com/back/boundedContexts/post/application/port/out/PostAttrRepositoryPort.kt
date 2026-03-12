package com.back.boundedContexts.post.application.port.out

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr

interface PostAttrRepositoryPort {
    fun findBySubjectAndName(
        subject: Post,
        name: String,
    ): PostAttr?

    fun findBySubjectInAndNameIn(
        subjects: List<Post>,
        names: List<String>,
    ): List<PostAttr>

    fun incrementIntValue(
        subject: Post,
        name: String,
        delta: Int = 1,
    ): Int

    fun save(attr: PostAttr): PostAttr
}
