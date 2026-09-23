package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.post.application.port.output.PostImageReferenceRepositoryPort
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional

@Repository
class PostImageReferenceJdbcRepository(
    private val jdbcTemplate: JdbcTemplate,
) : PostImageReferenceRepositoryPort {
    @Transactional(readOnly = true)
    override fun existsByPostIdAndObjectKey(
        postId: Long,
        objectKey: String,
    ): Boolean {
        if (postId <= 0L || objectKey.isBlank()) return false
        val count =
            jdbcTemplate.queryForObject(
                """
                SELECT COUNT(1)
                FROM post_image_references
                WHERE post_id = ? AND object_key = ?
                """.trimIndent(),
                Long::class.java,
                postId,
                objectKey,
            ) ?: 0L
        return count > 0L
    }

    @Transactional(readOnly = true)
    override fun existsByObjectKey(objectKey: String): Boolean {
        if (objectKey.isBlank()) return false
        val count =
            jdbcTemplate.queryForObject(
                """
                SELECT COUNT(1)
                FROM post_image_references
                WHERE object_key = ?
                """.trimIndent(),
                Long::class.java,
                objectKey,
            ) ?: 0L
        return count > 0L
    }

    @Transactional
    override fun replacePostImageReferences(
        postId: Long,
        objectKeys: Collection<String>,
    ) {
        if (postId <= 0L) return

        val normalizedKeys =
            objectKeys
                .asSequence()
                .map(String::trim)
                .filter(String::isNotBlank)
                .distinct()
                .toList()

        jdbcTemplate.update(
            """
            DELETE FROM post_image_references
            WHERE post_id = ?
            """.trimIndent(),
            postId,
        )

        if (normalizedKeys.isEmpty()) return

        jdbcTemplate.batchUpdate(
            """
            INSERT INTO post_image_references (post_id, object_key, created_at, modified_at)
            VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (post_id, object_key) DO NOTHING
            """.trimIndent(),
            normalizedKeys,
            normalizedKeys.size,
        ) { preparedStatement, key ->
            preparedStatement.setLong(1, postId)
            preparedStatement.setString(2, key)
        }
    }

    @Transactional
    override fun deletePostImageReferences(postId: Long) {
        if (postId <= 0L) return
        jdbcTemplate.update(
            """
            DELETE FROM post_image_references
            WHERE post_id = ?
            """.trimIndent(),
            postId,
        )
    }

    @Transactional(readOnly = true)
    override fun findObjectKeysByPostId(postId: Long): List<String> {
        if (postId <= 0L) return emptyList()
        return jdbcTemplate.query(
            """
            SELECT object_key
            FROM post_image_references
            WHERE post_id = ?
            ORDER BY id ASC
            """.trimIndent(),
            { resultSet, _ -> resultSet.getString("object_key") },
            postId,
        )
    }
}
