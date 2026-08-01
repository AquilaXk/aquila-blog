package com.back.boundedContexts.post.application.service

import org.slf4j.LoggerFactory
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.sql.Timestamp

@Service
class PostSummaryBackfillService(
    private val jdbcTemplate: JdbcTemplate,
) {
    private data class BackfillRow(
        val id: Long,
        val title: String,
        val content: String,
    )

    @Transactional
    fun backfillNextBatch(limit: Int): Int {
        val safeLimit = limit.coerceIn(1, 500)
        val rows =
            jdbcTemplate.query(
                """
                SELECT id, title, content
                FROM post
                WHERE summary_algorithm_version IS NULL
                ORDER BY id ASC
                LIMIT ?
                """.trimIndent(),
                { resultSet, _ ->
                    BackfillRow(
                        id = resultSet.getLong("id"),
                        title = resultSet.getString("title"),
                        content = resultSet.getString("content"),
                    )
                },
                safeLimit,
            )
        if (rows.isEmpty()) return 0

        var updated = 0
        for (row in rows) {
            val resolved = PostSummaryResolver.resolveAutomatic(row.title, row.content)
            updated +=
                jdbcTemplate.update(
                    """
                    UPDATE post
                    SET summary_text = ?,
                        summary_source = ?,
                        summary_content_hash = ?,
                        summary_algorithm_version = ?,
                        summary_generated_at = ?
                    WHERE id = ?
                      AND summary_algorithm_version IS NULL
                    """.trimIndent(),
                    resolved.text.takeIf { it.isNotBlank() },
                    resolved.source.name,
                    resolved.contentHash,
                    resolved.algorithmVersion,
                    resolved.generatedAt?.let(Timestamp::from),
                    row.id,
                )
        }
        return updated
    }
}

@Component
class PostSummaryBackfillRunner(
    private val postSummaryBackfillService: PostSummaryBackfillService,
) : ApplicationRunner {
    private val logger = LoggerFactory.getLogger(PostSummaryBackfillRunner::class.java)

    override fun run(args: ApplicationArguments) {
        var processed = 0
        while (true) {
            val updated = postSummaryBackfillService.backfillNextBatch(BATCH_SIZE)
            if (updated == 0) break
            processed += updated
        }
        logger.info("post_summary_backfill_completed processed={}", processed)
    }

    companion object {
        private const val BATCH_SIZE = 100
    }
}
