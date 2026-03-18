package com.back.boundedContexts.post.domain

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.postMixin.PostHasComments
import com.back.boundedContexts.post.domain.postMixin.PostHasHit
import com.back.boundedContexts.post.domain.postMixin.PostHasLikes
import com.back.boundedContexts.post.domain.postMixin.PostHasPolicy
import com.back.global.jpa.domain.AfterDDL
import com.back.global.jpa.domain.BaseTime
import jakarta.persistence.*
import jakarta.persistence.GenerationType.SEQUENCE
import org.hibernate.annotations.DynamicUpdate
import org.hibernate.annotations.SQLRestriction
import java.time.Instant

/**
 * Post는 비즈니스 상태와 규칙을 캡슐화하는 도메인 모델입니다.
 * 도메인 불변조건을 지키며 상태 변경을 메서드 단위로 통제합니다.
 */
@Entity
@DynamicUpdate
@SQLRestriction("deleted_at IS NULL")
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS post_idx_listed_created_at_desc
    ON post (listed, created_at DESC)
    """,
)
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS post_idx_published_listed_created_at_desc
    ON post (published, listed, created_at DESC)
    """,
)
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS post_idx_listed_modified_at_desc
    ON post (listed, modified_at DESC)
    """,
)
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS post_idx_author_created_at_desc
    ON post (author_id, created_at DESC)
    """,
)
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS post_idx_author_modified_at_desc
    ON post (author_id, modified_at DESC)
    """,
)
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS post_idx_deleted_at_desc
    ON post (deleted_at DESC, id DESC)
    WHERE deleted_at IS NOT NULL
    """,
)
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS idx_post_title_content_pgroonga
    ON post USING pgroonga ((ARRAY["title"::text, "content"::text])
    pgroonga_text_array_full_text_search_ops_v2) WITH (tokenizer = 'TokenBigram')
    """,
)
class Post(
    @field:Id
    @field:SequenceGenerator(name = "post_seq_gen", sequenceName = "post_seq", allocationSize = 50)
    @field:GeneratedValue(strategy = SEQUENCE, generator = "post_seq_gen")
    override val id: Int = 0,
    @field:ManyToOne(fetch = FetchType.LAZY)
    @field:JoinColumn(nullable = false)
    val author: Member,
    @field:Column(columnDefinition = "TEXT", nullable = false)
    var title: String,
    @field:Basic(fetch = FetchType.LAZY)
    @field:Column(columnDefinition = "TEXT", nullable = false)
    var content: String,
    @field:Version
    var version: Long? = null,
    @field:Column(nullable = false)
    var published: Boolean = false,
    @field:Column(nullable = false)
    var listed: Boolean = false,
    @field:Basic(fetch = FetchType.LAZY)
    @field:Column(name = "content_html", columnDefinition = "TEXT")
    var contentHtml: String? = null,
) : BaseTime(id),
    PostHasHit,
    PostHasLikes,
    PostHasComments,
    PostHasPolicy {
    @field:Column
    var deletedAt: Instant? = null

    fun softDelete() {
        deletedAt = Instant.now()
    }

    @field:OneToOne(fetch = FetchType.LAZY)
    var likesCountAttr: PostAttr? = null

    @field:OneToOne(fetch = FetchType.LAZY)
    var commentsCountAttr: PostAttr? = null

    @field:OneToOne(fetch = FetchType.LAZY)
    var hitCountAttr: PostAttr? = null

    override val post: Post get() = this

    fun modify(
        title: String,
        content: String,
        published: Boolean? = null,
        listed: Boolean? = null,
        contentHtml: String? = this.contentHtml,
    ) {
        this.title = title
        this.content = content
        this.contentHtml = contentHtml
        published?.let { this.published = it }
        listed?.let { this.listed = it }
        if (!this.published) this.listed = false
    }
}
