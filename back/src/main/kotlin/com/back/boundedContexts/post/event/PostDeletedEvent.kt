package com.back.boundedContexts.post.event

import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.standard.dto.EventPayload
import com.fasterxml.jackson.annotation.JsonCreator
import com.fasterxml.jackson.annotation.JsonGetter
import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonProperty
import java.util.*

data class PostDeletedEvent
    @JsonCreator
    constructor(
        override val uid: UUID,
        override val aggregateType: String,
        override val aggregateId: Long,
        @param:JsonProperty("postDto")
        @get:JsonIgnore
        val postDto: PostDto,
        val actorDto: MemberDto,
        val beforeTags: List<String> = emptyList(),
        val afterTags: List<String> = emptyList(),
    ) : EventPayload {
        @JsonGetter("postDto")
        fun getPostDtoForJson() = postDto.forEventLog()

        constructor(
            uid: UUID,
            postDto: PostDto,
            actorDto: MemberDto,
            beforeTags: List<String> = emptyList(),
            afterTags: List<String> = emptyList(),
        ) : this(
            uid,
            postDto::class.simpleName!!,
            postDto.id,
            postDto,
            actorDto,
            beforeTags,
            afterTags,
        )
    }
