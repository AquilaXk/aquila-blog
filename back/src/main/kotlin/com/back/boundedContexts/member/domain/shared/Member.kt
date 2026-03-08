package com.back.boundedContexts.member.domain.shared

import com.back.boundedContexts.member.domain.shared.memberMixin.MemberHasProfileImgUrl
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberHasSecurity
import com.back.boundedContexts.member.out.shared.MemberAttrRepository
import com.back.boundedContexts.post.domain.PostMember
import com.back.global.jpa.domain.AfterDDL
import com.back.global.jpa.domain.BaseTime
import jakarta.persistence.*
import jakarta.persistence.GenerationType.SEQUENCE
import org.hibernate.annotations.DynamicUpdate
import org.hibernate.annotations.NaturalId
import org.hibernate.annotations.SQLRestriction
import java.time.Instant

@Entity
@DynamicUpdate
@SQLRestriction("deleted_at IS NULL")
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS member_idx_created_at_desc
    ON member (created_at DESC)
"""
)
@AfterDDL(
    """
        CREATE INDEX IF NOT EXISTS member_idx_modified_at_desc
        ON member (modified_at DESC)
"""
)
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS member_idx_pgroonga_username_nickname
    ON member USING pgroonga ((ARRAY["username"::text, "nickname"::text])
    pgroonga_text_array_full_text_search_ops_v2) WITH (tokenizer = 'TokenBigram')
    """
)
class Member(
    @field:Id
    @field:SequenceGenerator(name = "member_seq_gen", sequenceName = "member_seq", allocationSize = 50)
    @field:GeneratedValue(strategy = SEQUENCE, generator = "member_seq")
    override val id: Int = 0,

    @field:NaturalId
    @field:Column(unique = true, nullable = false)
    val username: String,

    @field:Column(nullable = true)
    var password: String? = null,

    @field:Column(nullable = false)
    var nickname: String,

    @field:Column(unique = true, nullable = false)
    var apiKey: String,
) : BaseTime(id), PostMember, MemberHasSecurity, MemberHasProfileImgUrl {
    constructor(id: Int, username: String, password: String?, nickname: String) : this(
        id,
        username,
        password,
        nickname,
        MemberPolicy.genApiKey(),
    )

    companion object {
        lateinit var attrRepository_: MemberAttrRepository
        val attrRepository by lazy { attrRepository_ }
    }

    @field:Column
    var deletedAt: Instant? = null

    fun softDelete() {
        deletedAt = Instant.now()
    }

    override val member: Member
        get() = this

    override val name: String
        get() = nickname

    val isAdmin: Boolean
        get() = username in setOf("system", "admin")


    fun modify(nickname: String, profileImgUrl: String?) {
        this.nickname = nickname
        profileImgUrl?.let { this.profileImgUrl = it }
    }

    fun modifyApiKey(apiKey: String) {
        this.apiKey = apiKey
    }
}
