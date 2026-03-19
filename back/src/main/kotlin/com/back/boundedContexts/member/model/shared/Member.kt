package com.back.boundedContexts.member.model.shared

import com.back.boundedContexts.member.domain.shared.MemberPolicy
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberHasProfileCard
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberHasProfileImgUrl
import com.back.boundedContexts.post.domain.PostMember
import com.back.global.app.AppConfig
import com.back.global.jpa.domain.AfterDDL
import com.back.global.jpa.domain.BaseTime
import jakarta.persistence.*
import jakarta.persistence.GenerationType.SEQUENCE
import org.hibernate.annotations.DynamicUpdate
import org.hibernate.annotations.NaturalId
import org.hibernate.annotations.SQLRestriction
import java.time.Instant

/**
 * Member는 비즈니스 상태와 규칙을 캡슐화하는 도메인 모델입니다.
 * 도메인 불변조건을 지키며 상태 변경을 메서드 단위로 통제합니다.
 */
@Entity
@DynamicUpdate
@SQLRestriction("deleted_at IS NULL")
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS member_idx_created_at_desc
    ON member (created_at DESC)
""",
)
@AfterDDL(
    """
        CREATE INDEX IF NOT EXISTS member_idx_modified_at_desc
        ON member (modified_at DESC)
""",
)
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS member_idx_pgroonga_username_nickname
    ON member USING pgroonga ((ARRAY["username"::text, "nickname"::text])
    pgroonga_text_array_full_text_search_ops_v2) WITH (tokenizer = 'TokenBigram')
    """,
)
class Member(
    @field:Id
    @field:SequenceGenerator(name = "member_seq_gen", sequenceName = "member_seq", allocationSize = 50)
    @field:GeneratedValue(strategy = SEQUENCE, generator = "member_seq_gen")
    override val id: Int = 0,
    @field:NaturalId
    @field:Column(unique = true, nullable = false)
    val username: String,
    @field:Column(nullable = true)
    var password: String? = null,
    @field:Column(nullable = false)
    var nickname: String,
    @field:Column(unique = true, nullable = true)
    var email: String? = null,
    @field:Column(unique = true, nullable = false)
    var apiKey: String,
) : BaseTime(id),
    PostMember,
    MemberHasProfileImgUrl,
    MemberHasProfileCard {
    constructor(
        id: Int,
        username: String,
        password: String?,
        nickname: String,
        email: String?,
    ) : this(
        id,
        username,
        password,
        nickname,
        email,
        MemberPolicy.genApiKey(),
    )

    constructor(
        id: Int,
        username: String,
        password: String?,
        nickname: String,
    ) : this(
        id,
        username,
        password,
        nickname,
        null,
    )

    internal constructor(id: Int) : this(id, "", null, "", null, "")

    @field:Column
    var deletedAt: Instant? = null

    @Transient
    override var postsCountAttr: MemberAttr? = null

    @Transient
    override var postCommentsCountAttr: MemberAttr? = null

    fun softDelete() {
        deletedAt = Instant.now()
    }

    override val member: Member
        get() = this

    override val name: String
        get() = nickname

    val isAdmin: Boolean
        get() = username == AppConfig.adminUsernameOrBlank

    fun modify(
        nickname: String,
        profileImgUrl: String?,
    ) {
        this.nickname = nickname
        profileImgUrl?.let { this.profileImgUrl = it }
    }

    fun modifyApiKey(apiKey: String) {
        this.apiKey = apiKey
    }
}
