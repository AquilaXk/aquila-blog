package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post

interface PostLikeRepositoryCustom {
    /**
     * @return 신규 좋아요 row id, 이미 존재하면 null
     */
    fun insertIfAbsent(
        liker: Member,
        post: Post,
    ): Int?
}
