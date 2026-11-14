package com.back.boundedContexts.post.model

import com.back.global.jpa.domain.AfterDDL
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path
import kotlin.reflect.KClass

class PostOperationalIndexContractTest {
    private val migrationSql: String =
        Files.readString(
            Path.of(
                "src/main/resources/db/migration/V20260723_01__add_operational_indexes_concurrently.sql",
            ),
        )

    private val concurrentIndexConfig: String =
        Files.readString(
            Path.of(
                "src/main/resources/db/migration/V20260723_01__add_operational_indexes_concurrently.sql.conf",
            ),
        )

    @Test
    fun `post hard-delete와 cleanup 인덱스는 AfterDDL과 versioned concurrent migration에 함께 선언된다`() {
        val expectedIndexes =
            mapOf(
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

    @Test
    fun `operational index migration is non-transactional concurrent`() {
        assertThat(concurrentIndexConfig).contains("executeInTransaction=false")
        assertThat(migrationSql).contains("CREATE INDEX CONCURRENTLY")
    }

    @Test
    fun `missing operational partial and composite indexes are declared in non-transactional V20261114_01 migration`() {
        val v2Sql =
            Files.readString(
                Path.of(
                    "src/main/resources/db/migration/V20261114_01__add_missing_operational_indexes_concurrently.sql",
                ),
            )
        val v2Conf =
            Files.readString(
                Path.of(
                    "src/main/resources/db/migration/V20261114_01__add_missing_operational_indexes_concurrently.sql.conf",
                ),
            )
        assertThat(v2Conf).contains("executeInTransaction=false")
        assertThat(v2Sql).contains("CREATE INDEX CONCURRENTLY")
        assertThat(v2Sql).doesNotContainIgnoringCase("BEGIN;")
        assertThat(v2Sql).doesNotContainIgnoringCase("COMMIT;")
        listOf(
            "post_idx_public_listed_active_created_at_id_desc",
            "post_idx_public_listed_active_hit_count_id_desc",
            "post_idx_public_listed_active_likes_count_id_desc",
            "post_idx_active_modified_at_id_desc",
            "post_tag_index_idx_tag_lower_post_id",
            "post_attr_idx_name_modified_at_desc",
            "member_session_idx_revoked_at_id_asc",
            "cloud_file_idx_owner_active_created_id_desc",
            "cloud_file_idx_active_object_key_pattern",
            "cloud_video_upload_session_idx_status_modified_id",
        ).forEach { expectedIndex ->
            assertThat(v2Sql).contains(expectedIndex)
        }
    }

    private fun KClass<*>.afterDdlSql(): String =
        java
            .getAnnotationsByType(AfterDDL::class.java)
            .joinToString("\n") { it.sql }
}
