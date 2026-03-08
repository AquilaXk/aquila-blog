package com.back.boundedContexts.post.event

import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.post.dto.PostCommentDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.standard.dto.EventPayload
import com.fasterxml.jackson.annotation.JsonCreator
import com.fasterxml.jackson.annotation.JsonGetter
import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonProperty
import java.util.*

data class PostCommentWrittenEvent @JsonCreator constructor(
    override val uid: UUID,
    override val aggregateType: String,
    override val aggregateId: Int,
    @field:JsonIgnore
    @JsonProperty("postCommentDto")
    val postCommentDto: PostCommentDto,
    @field:JsonIgnore
    @JsonProperty("postDto")
    val postDto: PostDto,
    val actorDto: MemberDto,
) : EventPayload {

    @JsonGetter("postCommentDto")
    fun getPostCommentDtoForJson() = postCommentDto.forEventLog()

    @JsonGetter("postDto")
    fun getPostDtoForJson() = postDto.forEventLog()

    constructor(uid: UUID, postCommentDto: PostCommentDto, postDto: PostDto, actorDto: MemberDto) : this(
        uid, postCommentDto::class.simpleName!!, postCommentDto.id, postCommentDto, postDto, actorDto
    )
}
