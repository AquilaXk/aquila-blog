package com.back.boundedContexts.post.event

import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.post.domain.Post
import com.back.standard.dto.EventPayload
import com.fasterxml.jackson.annotation.JsonCreator
import java.util.*

data class PostLikedEvent
    @JsonCreator
    constructor(
        override val uid: UUID,
        override val aggregateType: String,
        override val aggregateId: Long,
        val postId: Long,
        val postAuthorId: Long,
        val likeId: Long,
        val actorDto: MemberDto,
    ) : EventPayload {
        constructor(uid: UUID, postId: Long, postAuthorId: Long, likeId: Long, actorDto: MemberDto) : this(
            uid,
            Post::class.simpleName!!,
            postId,
            postId,
            postAuthorId,
            likeId,
            actorDto,
        )
    }
