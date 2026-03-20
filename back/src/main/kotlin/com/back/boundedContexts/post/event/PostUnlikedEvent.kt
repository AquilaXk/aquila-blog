package com.back.boundedContexts.post.event

import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.post.domain.Post
import com.back.standard.dto.EventPayload
import com.fasterxml.jackson.annotation.JsonCreator
import java.util.*

/**
 * `PostUnlikedEvent` 데이터 클래스입니다.
 * - 역할: 요청/응답/이벤트/상태 전달용 불변 데이터 구조를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
data class PostUnlikedEvent
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
