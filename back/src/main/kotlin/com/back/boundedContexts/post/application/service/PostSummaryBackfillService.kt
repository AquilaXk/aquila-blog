package com.back.boundedContexts.post.application.service

import com.back.global.revalidate.CdnCachePurgeService
import com.back.global.revalidate.dto.PurgePostReadCachesPayload
import com.back.global.task.application.TaskFacade
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.nio.charset.StandardCharsets
import java.sql.Timestamp
import java.util.UUID

@Service
class PostSummaryBackfillService(
    private val jdbcTemplate: JdbcTemplate,
    private val postTagIndexService: PostTagIndexService,
    private val taskFacade: TaskFacade,
    private val cdnCachePurgeService: CdnCachePurgeService,
) {
    private data class BackfillRow(
        val id: Long,
        val title: String,
        val content: String,
        val version: Long?,
        val published: Boolean,
        val listed: Boolean,
        val deletedAt: Timestamp?,
    )

    data class BatchResult(
        val scanned: Int,
        val updated: Int,
        val skipped: Int,
        val nextAfterId: Long,
        val hasMore: Boolean,
        val dryRun: Boolean,
    )

    @Transactional
    fun backfillBatch(
        afterId: Long,
        limit: Int,
        dryRun: Boolean,
    ): BatchResult {
        val safeLimit = limit.coerceIn(1, 500)
        val rows =
            jdbcTemplate.query(
                """
                SELECT id, title, content, version, published, listed, deleted_at
                FROM post
                WHERE id > ?
                  AND summary_algorithm_version IS NULL
                ORDER BY id ASC
                LIMIT ?
                """.trimIndent(),
                { resultSet, _ ->
                    BackfillRow(
                        id = resultSet.getLong("id"),
                        title = resultSet.getString("title"),
                        content = resultSet.getString("content"),
                        version = (resultSet.getObject("version") as? Number)?.toLong(),
                        published = resultSet.getBoolean("published"),
                        listed = resultSet.getBoolean("listed"),
                        deletedAt = resultSet.getTimestamp("deleted_at"),
                    )
                },
                afterId.coerceAtLeast(0),
                safeLimit,
            )
        if (rows.isEmpty()) {
            return BatchResult(0, 0, 0, afterId, hasMore = false, dryRun = dryRun)
        }
        if (dryRun) {
            return BatchResult(rows.size, 0, 0, afterId, hasMore = rows.size == safeLimit, dryRun = true)
        }

        var updated = 0
        var firstSkippedId: Long? = null
        for (row in rows) {
            val resolved = PostSummaryResolver.resolveForBackfill(row.title, row.content)
            val changed =
                jdbcTemplate.update(
                    """
                    UPDATE post
                    SET summary_text = ?,
                        summary_source = ?,
                        summary_content_hash = ?,
                        summary_algorithm_version = ?,
                        summary_generated_at = ?
                    WHERE id = ?
                      AND published = ?
                      AND listed = ?
                      AND deleted_at IS NOT DISTINCT FROM ?
                      AND version IS NOT DISTINCT FROM ?
                      AND content = ?
                      AND summary_algorithm_version IS NULL
                    """.trimIndent(),
                    resolved.text.takeIf { it.isNotBlank() },
                    resolved.source.name,
                    resolved.contentHash,
                    resolved.algorithmVersion,
                    resolved.generatedAt?.let(Timestamp::from),
                    row.id,
                    row.published,
                    row.listed,
                    row.deletedAt,
                    row.version,
                    row.content,
                )
            updated += changed
            if (changed > 0) enqueueInvalidation(row, resolved)
            if (changed == 0 && firstSkippedId == null) firstSkippedId = row.id
        }
        val skipped = rows.size - updated
        return BatchResult(
            scanned = rows.size,
            updated = updated,
            skipped = skipped,
            nextAfterId = firstSkippedId?.minus(1)?.coerceAtLeast(afterId) ?: rows.last().id,
            hasMore = rows.size == safeLimit || skipped > 0,
            dryRun = false,
        )
    }

    private fun enqueueInvalidation(
        row: BackfillRow,
        resolved: PostSummaryResolver.ResolvedPostSummary,
    ) {
        val isPublic = row.published && row.listed && row.deletedAt == null
        val tags = if (isPublic) postTagIndexService.extractNormalizedTags(row.content) else emptyList()
        val scope =
            if (isPublic) {
                PostReadCacheInvalidationScope.PublicPostModified(setOf(PostPublicChangeImpact.SUMMARY))
            } else {
                PostReadCacheInvalidationScope.AdminPostListOnly
            }
        val source = "post-summary-backfill:${row.id}:${resolved.contentHash}"
        taskFacade.addToQueue(
            PostWriteSideEffectPayload(
                uid = taskUid(source),
                aggregateType = "Post",
                aggregateId = row.id,
                postId = row.id,
                previousContent = null,
                currentContent = null,
                deletedContent = null,
                beforeTags = tags,
                afterTags = tags,
                cacheInvalidationTargets = scope.targets(),
                evictReason = "summary-backfill",
                recommendationAction = PostRecommendationSideEffect.NONE,
                domainEventType = null,
                domainEventJson = null,
            ),
            inlineWhenEnabled = false,
        )
        if (isPublic && cdnCachePurgeService.isEnabled()) {
            taskFacade.addToQueue(
                PurgePostReadCachesPayload(
                    uid = taskUid("$source:cdn"),
                    aggregateType = "Post",
                    aggregateId = row.id,
                    postId = row.id,
                    beforeTags = tags,
                    afterTags = tags,
                ),
                inlineWhenEnabled = false,
            )
        }
    }

    private fun taskUid(source: String): UUID = UUID.nameUUIDFromBytes(source.toByteArray(StandardCharsets.UTF_8))
}
