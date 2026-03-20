package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.post.application.port.output.PostTagIndexRepositoryPort
import org.slf4j.LoggerFactory
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.util.concurrent.atomic.AtomicReference

/**
 * PostTagIndexJdbcRepository는 post_tag_index 테이블 기반 태그 저장/집계를 담당합니다.
 * 본문/속성 문자열 파싱 집계를 피하고 SQL group by 집계로 태그 카운트를 계산합니다.
 */
@Component
class PostTagIndexJdbcRepository(
    private val jdbcTemplate: JdbcTemplate,
) : PostTagIndexRepositoryPort {
    private val logger = LoggerFactory.getLogger(PostTagIndexJdbcRepository::class.java)
    private val tableAvailable = AtomicReference<Boolean?>(null)

    override fun replacePostTags(
        postId: Long,
        tags: List<String>,
    ) {
        if (!isTableAvailable()) return

        val normalizedTags =
            tags
                .asSequence()
                .map(String::trim)
                .filter(String::isNotBlank)
                .distinct()
                .toList()

        try {
            jdbcTemplate.update(
                """
                DELETE FROM post_tag_index
                WHERE post_id = ?
                """.trimIndent(),
                postId,
            )
        } catch (exception: DataAccessException) {
            markUnavailable(exception)
            return
        }

        if (normalizedTags.isEmpty()) return

        try {
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
        } catch (exception: DataAccessException) {
            markUnavailable(exception)
        }
    }

    override fun findAllPublicTagCounts(): List<PostTagIndexRepositoryPort.TagCountRow> =
        if (!isTableAvailable()) {
            emptyList()
        } else {
            try {
                jdbcTemplate.query(
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
                    """.trimIndent(),
                ) { resultSet, _ ->
                    PostTagIndexRepositoryPort.TagCountRow(
                        tag = resultSet.getString("tag"),
                        count = resultSet.getInt("count"),
                    )
                }
            } catch (exception: DataAccessException) {
                markUnavailable(exception)
                emptyList()
            }
        }

    private fun isTableAvailable(): Boolean {
        val cached = tableAvailable.get()
        if (cached != null) return cached
        return detectTableAvailability()
    }

    private fun detectTableAvailability(): Boolean {
        val detected =
            runCatching {
                jdbcTemplate.queryForObject(
                    "SELECT to_regclass('public.post_tag_index') IS NOT NULL",
                    Boolean::class.java,
                ) ?: false
            }.getOrDefault(false)
        tableAvailable.set(detected)
        return detected
    }

    private fun markUnavailable(exception: DataAccessException) {
        tableAvailable.set(false)
        logger.warn("post_tag_index unavailable: skip optimized tag index path", exception)
    }
}
