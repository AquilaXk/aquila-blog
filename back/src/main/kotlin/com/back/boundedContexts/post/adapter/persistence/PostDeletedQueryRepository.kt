package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.post.dto.AdmDeletedPostDto
import com.back.boundedContexts.post.dto.AdmDeletedPostSnapshotDto
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.Pageable
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component

/**
 * PostDeletedQueryRepository는 영속 계층(JPA/쿼리) 연동을 담당하는 퍼시스턴스 어댑터입니다.
 * 도메인 요구사항에 맞는 조회/저장 연산을 DB 구현으로 매핑합니다.
 */
@Component
class PostDeletedQueryRepository(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun findDeletedSnapshotById(id: Long): AdmDeletedPostSnapshotDto? =
        jdbcTemplate
            .query(
                """
                select id, title, content, author_id
                from post
                where id = ?
                  and deleted_at is not null
                """.trimIndent(),
                { rs, _ ->
                    AdmDeletedPostSnapshotDto(
                        id = rs.getLong("id"),
                        title = rs.getString("title"),
                        content = rs.getString("content"),
                        authorId = rs.getLong("author_id"),
                    )
                },
                id,
            ).firstOrNull()

    fun findDeletedPagedByKw(
        kw: String,
        pageable: Pageable,
    ): Page<AdmDeletedPostDto> {
        val normalizedKw = kw.trim()
        val hasKeyword = normalizedKw.isNotBlank()
        val escapedKw = "%${escapeLike(normalizedKw.lowercase())}%"

        val whereClause =
            if (hasKeyword) {
                """
                p.deleted_at is not null
                  and (
                    lower(p.title) like ? escape '\'
                    or lower(p.content) like ? escape '\'
                  )
                """.trimIndent()
            } else {
                "p.deleted_at is not null"
            }

        val listSql =
            """
            select
              p.id,
              p.title,
              p.author_id,
              coalesce(m.nickname, m.username, '알 수 없음') as author_name,
              p.published,
              p.listed,
              p.created_at,
              p.modified_at,
              p.deleted_at
            from post p
            left join member m on m.id = p.author_id
            where $whereClause
            order by p.deleted_at desc, p.id desc
            limit ? offset ?
            """.trimIndent()

        val countSql =
            """
            select count(*)
            from post p
            where $whereClause
            """.trimIndent()

        val listParams =
            mutableListOf<Any>().apply {
                if (hasKeyword) {
                    add(escapedKw)
                    add(escapedKw)
                }
                add(pageable.pageSize)
                add(pageable.offset)
            }

        val countParams =
            mutableListOf<Any>().apply {
                if (hasKeyword) {
                    add(escapedKw)
                    add(escapedKw)
                }
            }

        val rows =
            jdbcTemplate.query(
                listSql,
                { rs, _ ->
                    AdmDeletedPostDto(
                        id = rs.getLong("id"),
                        title = rs.getString("title"),
                        authorId = rs.getLong("author_id"),
                        authorName = rs.getString("author_name"),
                        published = rs.getBoolean("published"),
                        listed = rs.getBoolean("listed"),
                        createdAt = rs.getTimestamp("created_at").toInstant(),
                        modifiedAt = rs.getTimestamp("modified_at").toInstant(),
                        deletedAt = rs.getTimestamp("deleted_at").toInstant(),
                    )
                },
                *listParams.toTypedArray(),
            )

        val total =
            jdbcTemplate.queryForObject(countSql, Long::class.java, *countParams.toTypedArray()) ?: 0L

        return PageImpl(rows, pageable, total)
    }

    fun softDeleteById(id: Long): Boolean {
        val updatedRows =
            jdbcTemplate.update(
                """
                update post
                set deleted_at = now(),
                    modified_at = now()
                where id = ?
                  and deleted_at is null
                """.trimIndent(),
                id,
            )
        return updatedRows > 0
    }

    fun restoreDeletedById(id: Long): Boolean {
        val updatedRows =
            jdbcTemplate.update(
                """
                update post
                set deleted_at = null,
                    modified_at = now()
                where id = ?
                  and deleted_at is not null
                """.trimIndent(),
                id,
            )
        return updatedRows > 0
    }

    fun hardDeleteDeletedById(id: Long): Boolean {
        val markedRows =
            jdbcTemplate.update(
                """
                update post
                set likes_count_attr_id = null,
                    comments_count_attr_id = null,
                    hit_count_attr_id = null
                where id = ?
                  and deleted_at is not null
                """.trimIndent(),
                id,
            )
        if (markedRows <= 0) return false

        jdbcTemplate.update("delete from post_like where post_id = ?", id)
        jdbcTemplate.update("delete from post_comment where post_id = ?", id)
        jdbcTemplate.update("delete from post_attr where subject_id = ?", id)
        jdbcTemplate.update("update post_write_request_idempotency set post_id = null where post_id = ?", id)

        val deletedRows =
            jdbcTemplate.update(
                """
                delete from post
                where id = ?
                  and deleted_at is not null
                """.trimIndent(),
                id,
            )
        return deletedRows > 0
    }

    private fun escapeLike(value: String): String =
        value
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
}
