package com.back.boundedContexts.member.domain.shared

import com.back.global.app.AppConfig
import com.back.global.jpa.domain.AfterDDL
import com.back.global.jpa.domain.BaseTime
import jakarta.persistence.*
import jakarta.persistence.GenerationType.SEQUENCE
import org.hibernate.annotations.DynamicUpdate
import org.hibernate.annotations.NaturalId

@Entity
@DynamicUpdate
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

    @field:Column(columnDefinition = "TEXT")
    var profileImgUrl: String? = null,
) : BaseTime(id), HasMember {
    constructor(id: Int) : this(id, "", null, "", "", null)

    constructor(id: Int, username: String, nickname: String) : this(id, username, null, nickname, "", null)

    override val member: Member
        get() = this

    override val name: String
        get() = nickname

    val isAdmin: Boolean
        get() = username in setOf("system", "admin")

    val profileImgUrlOrDefault: String
        get() = profileImgUrl
            ?.takeIf { it.isNotBlank() }
            ?: "https://placehold.co/600x600?text=U_U"

    val redirectToProfileImgUrlOrDefault: String
        get() = "${AppConfig.siteBackUrl}/member/api/v1/members/$id/redirectToProfileImg"

    fun modify(nickname: String, profileImgUrl: String?) {
        this.nickname = nickname
        profileImgUrl?.let { this.profileImgUrl = it }
    }

    fun modifyApiKey(apiKey: String) {
        this.apiKey = apiKey
    }
}
