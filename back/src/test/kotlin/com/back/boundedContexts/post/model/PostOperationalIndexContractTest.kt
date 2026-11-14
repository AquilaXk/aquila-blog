package com.back.boundedContexts.post.model

import com.back.global.jpa.domain.AfterDDL
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.yaml.snakeyaml.Yaml
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
        val dropStatement =
            "DROP INDEX CONCURRENTLY IF EXISTS post_idx_public_listed_active_created_at_id_desc;"
        val createStatement =
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS post_idx_public_listed_active_created_at_id_desc"
        val dropIndex = v2Sql.indexOf(dropStatement)
        val createIndex = v2Sql.indexOf(createStatement)
        assertThat(dropIndex).isGreaterThanOrEqualTo(0)
        assertThat(createIndex).isGreaterThan(dropIndex)
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

    @Test
    fun `admin and reader composite partial indexes are declared in non-transactional V20261115_01 migration`() {
        val v3Sql =
            Files.readString(
                Path.of(
                    "src/main/resources/db/migration/V20261115_01__add_admin_and_reader_composite_indexes_concurrently.sql",
                ),
            )
        val v3Conf =
            Files.readString(
                Path.of(
                    "src/main/resources/db/migration/V20261115_01__add_admin_and_reader_composite_indexes_concurrently.sql.conf",
                ),
            )
        assertThat(v3Conf).contains("executeInTransaction=false")
        assertThat(v3Sql).contains("CREATE INDEX CONCURRENTLY")
        assertThat(v3Sql).doesNotContainIgnoringCase("BEGIN;")
        assertThat(v3Sql).doesNotContainIgnoringCase("COMMIT;")
        listOf(
            "post_idx_active_status_modified_at_id_desc",
            "post_idx_active_created_at_id_desc",
            "post_idx_public_listed_active_modified_at_id_desc",
            "post_idx_public_listed_author_created_at_id_desc",
            "uploaded_file_idx_object_key_pattern_id_asc",
        ).forEach { expectedIndex ->
            assertThat(v3Sql).contains(expectedIndex)
        }
    }

    @Test
    fun `application and prod flyway configs disable postgresql transactional advisory lock`() {
        listOf(
            Path.of("src/main/resources/application.yaml"),
            Path.of("src/main/resources/application-prod.yaml"),
        ).forEach { configPath ->
            val root = Yaml().load<Map<String, Any>>(Files.readString(configPath))
            val spring = root["spring"] as? Map<*, *>
            val flyway = spring?.get("flyway") as? Map<*, *>
            val postgresql = flyway?.get("postgresql") as? Map<*, *>
            assertThat(postgresql?.get("transactional-lock"))
                .describedAs("spring.flyway.postgresql.transactional-lock in %s", configPath)
                .isEqualTo(false)
        }
    }

    private fun KClass<*>.afterDdlSql(): String =
        java
            .getAnnotationsByType(AfterDDL::class.java)
            .joinToString("\n") { it.sql }
}
