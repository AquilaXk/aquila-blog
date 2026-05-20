package com.back.boundedContexts.post.model

import com.back.global.jpa.domain.AfterDDL
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path
import kotlin.reflect.KClass

class PostOperationalIndexContractTest {
    private val migrationSql: String =
        Files.readString(Path.of("src/main/resources/db/migration/R__operational_indexes.sql"))

    @Test
    fun `post hard-delete와 cleanup 인덱스는 AfterDDL과 repeatable migration에 함께 선언된다`() {
        val expectedIndexes =
            mapOf(
                PostComment::class to
                    listOf(
                        "post_comment_idx_post_id",
                        "post_comment_idx_parent_comment_id",
                    ),
                PostLike::class to
                    listOf("post_like_idx_post_id"),
                PostWriteRequestIdempotency::class to
                    listOf(
                        "post_write_request_idempotency_idx_post_id",
                        "post_write_request_idempotency_idx_created_at",
                    ),
            )

        expectedIndexes.forEach { (entityClass, indexNames) ->
            val afterDdlSql = entityClass.afterDdlSql()

            indexNames.forEach { indexName ->
                assertThat(afterDdlSql).contains(indexName)
                assertThat(migrationSql).contains(indexName)
            }
        }
    }

    private fun KClass<*>.afterDdlSql(): String =
        java
            .getAnnotationsByType(AfterDDL::class.java)
            .joinToString("\n") { it.sql }
}
