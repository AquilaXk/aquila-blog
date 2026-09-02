package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.post.application.port.output.PostTagIndexRepositoryPort
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component

internal val PUBLIC_TAG_COUNTS_SQL =
    """
    SELECT
        pti.tag AS tag,
        COUNT(*)::int AS count
    FROM post_tag_index pti
    JOIN post p
        ON p.id = pti.post_id
    WHERE p.deleted_at IS NULL
      AND p.published IS TRUE
      AND p.listed IS TRUE
    GROUP BY pti.tag
    ORDER BY COUNT(*) DESC, LOWER(pti.tag) ASC
    """.trimIndent()

/**
 * PostTagIndexJdbcRepository는 post_tag_index 테이블 기반 태그 저장/집계를 담당합니다.
 * 본문/속성 문자열 파싱 집계를 피하고 SQL group by 집계로 태그 카운트를 계산합니다.
 */
@Component
class PostTagIndexJdbcRepository(
    private val jdbcTemplate: JdbcTemplate,
) : PostTagIndexRepositoryPort {
    override fun findPostSourceForUpdate(postId: Long): PostTagIndexRepositoryPort.LockedPostSource? =
        jdbcTemplate
            .query(
                "SELECT content, deleted_at IS NOT NULL AS deleted FROM post WHERE id = ? FOR UPDATE",
                { resultSet, _ ->
                    PostTagIndexRepositoryPort.LockedPostSource(
                        content = resultSet.getString("content"),
                        deleted = resultSet.getBoolean("deleted"),
                    )
                },
                postId,
            ).singleOrNull()

    override fun replacePostTags(
        postId: Long,
        tags: List<String>,
    ) {
        val normalizedTags =
            tags
                .asSequence()
                .map(String::trim)
                .filter(String::isNotBlank)
                .distinct()
                .toList()

        val source = findPostSourceForUpdate(postId)
        if (source == null && normalizedTags.isNotEmpty()) {
            throw IllegalStateException("Cannot replace non-empty tags for missing postId=$postId")
        }
        if (source == null) return

        jdbcTemplate.update(
            """
            DELETE FROM post_tag_index
            WHERE post_id = ?
            """.trimIndent(),
            postId,
        )

        if (normalizedTags.isEmpty()) return

        jdbcTemplate.batchUpdate(
            """
            INSERT INTO post_tag_index (post_id, tag)
            VALUES (?, ?)
            ON CONFLICT (post_id, tag) DO NOTHING
            """.trimIndent(),
            normalizedTags,
            normalizedTags.size,
        ) { preparedStatement, tag ->
            preparedStatement.setLong(1, postId)
            preparedStatement.setString(2, tag)
        }
    }

    override fun findAllPublicTagCounts(): List<PostTagIndexRepositoryPort.TagCountRow> =
        jdbcTemplate.query(
            PUBLIC_TAG_COUNTS_SQL,
        ) { resultSet, _ ->
            PostTagIndexRepositoryPort.TagCountRow(
                tag = resultSet.getString("tag"),
                count = resultSet.getInt("count"),
            )
        }
}
