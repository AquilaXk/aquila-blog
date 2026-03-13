package com.back.boundedContexts.post.adapter.out.persistence

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import java.time.Instant

interface PostAttrRepositoryCustom {
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

    fun findRecentlyModifiedByName(
        name: String,
        modifiedAfter: Instant,
        limit: Int,
    ): List<PostAttr>
}
