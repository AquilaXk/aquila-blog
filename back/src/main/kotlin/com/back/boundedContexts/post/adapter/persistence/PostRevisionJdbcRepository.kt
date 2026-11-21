package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.post.application.port.output.PostRevisionRepositoryPort
import com.back.boundedContexts.post.dto.PostRevisionSnapshotDto
import com.back.boundedContexts.post.dto.PostRevisionSummaryDto
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional

/**
 * 참조 구현: TryGhost/Ghost (MIT) & payloadcms/payload (MIT) — 게시글 리비전 원장 JDBC 저장소
 */
@Repository
class PostRevisionJdbcRepository(
    private val jdbcTemplate: JdbcTemplate,
) : PostRevisionRepositoryPort {
    @Transactional
    override fun appendAndTrimRevisions(
        postId: Long,
        authorId: Long,
        title: String,
        content: String,
        summaryText: String?,
        maxRevisionsPerPost: Int,
    ): Long? {
        if (postId <= 0L || authorId <= 0L) return null
        val safeRetainCount = maxRevisionsPerPost.coerceIn(1, MAX_RETAINED_REVISIONS_PER_POST)
        val revisionId =
            jdbcTemplate
                .query(
                    """
                    INSERT INTO post_revision (id, post_id, author_id, title, content, summary_text, created_at)
                    VALUES (nextval('post_revision_seq'), ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    RETURNING id
                    """.trimIndent(),
                    { rs, _ -> rs.getLong("id") },
                    postId,
                    authorId,
                    title,
                    content,
                    summaryText,
                ).firstOrNull()

        jdbcTemplate.update(
            """
            DELETE FROM post_revision
            WHERE post_id = ?
              AND id NOT IN (
                  SELECT keep.id
                  FROM post_revision keep
                  WHERE keep.post_id = ?
                  ORDER BY keep.id DESC
                  LIMIT ?
              )
            """.trimIndent(),
            postId,
            postId,
            safeRetainCount,
        )
        return revisionId
    }

    @Transactional(readOnly = true)
    override fun findSummariesByPostId(
        postId: Long,
        limit: Int,
    ): List<PostRevisionSummaryDto> {
        if (postId <= 0L) return emptyList()
        val safeLimit = limit.coerceIn(1, MAX_RETAINED_REVISIONS_PER_POST)
        return jdbcTemplate.query(
            """
            SELECT id, post_id, title, summary_text, char_length(content) AS content_length, created_at
            FROM post_revision
            WHERE post_id = ?
            ORDER BY id DESC
            LIMIT ?
            """.trimIndent(),
            { rs, _ ->
                PostRevisionSummaryDto(
                    id = rs.getLong("id"),
                    postId = rs.getLong("post_id"),
                    title = rs.getString("title"),
                    summaryText = rs.getString("summary_text"),
                    contentLength = rs.getInt("content_length"),
                    createdAt = rs.getTimestamp("created_at").toInstant(),
                )
            },
            postId,
            safeLimit,
        )
    }

    @Transactional(readOnly = true)
    override fun findByPostIdAndRevisionId(
        postId: Long,
        revisionId: Long,
    ): PostRevisionSnapshotDto? {
        if (postId <= 0L || revisionId <= 0L) return null
        return jdbcTemplate
            .query(
                """
                SELECT id, post_id, author_id, title, content, summary_text, created_at
                FROM post_revision
                WHERE post_id = ? AND id = ?
                LIMIT 1
                """.trimIndent(),
                { rs, _ ->
                    PostRevisionSnapshotDto(
                        id = rs.getLong("id"),
                        postId = rs.getLong("post_id"),
                        authorId = rs.getLong("author_id"),
                        title = rs.getString("title"),
                        content = rs.getString("content"),
                        summaryText = rs.getString("summary_text"),
                        createdAt = rs.getTimestamp("created_at").toInstant(),
                    )
                },
                postId,
                revisionId,
            ).firstOrNull()
    }

    @Transactional
    override fun deleteByPostId(postId: Long) {
        if (postId <= 0L) return
        jdbcTemplate.update(
            """
            DELETE FROM post_revision
            WHERE post_id = ?
            """.trimIndent(),
            postId,
        )
    }

    companion object {
        private const val MAX_RETAINED_REVISIONS_PER_POST = 20
    }
}
