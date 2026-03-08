package com.back.boundedContexts.post.out

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr

interface PostAttrRepositoryCustom {
    fun findBySubjectAndName(subject: Post, name: String): PostAttr?
}
