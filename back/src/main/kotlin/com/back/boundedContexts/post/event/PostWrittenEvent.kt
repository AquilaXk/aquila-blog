package com.back.boundedContexts.post.event

import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.standard.dto.EventPayload
import com.fasterxml.jackson.annotation.JsonCreator
import com.fasterxml.jackson.annotation.JsonGetter
import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonProperty
import java.util.*

/**
 * `PostWrittenEvent` 데이터 클래스입니다.
 * - 역할: 요청/응답/이벤트/상태 전달용 불변 데이터 구조를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
data class PostWrittenEvent
    @JsonCreator
    constructor(
        override val uid: UUID,
        override val aggregateType: String,
        override val aggregateId: Long,
        @field:JsonIgnore
        @JsonProperty("postDto")
        val postDto: PostDto,
        val actorDto: MemberDto,
    ) : EventPayload {
        @JsonGetter("postDto")
        fun getPostDtoForJson() = postDto.forEventLog()

        constructor(uid: UUID, postDto: PostDto, actorDto: MemberDto) : this(
            uid,
            postDto::class.simpleName!!,
            postDto.id,
            postDto,
            actorDto,
        )
    }
