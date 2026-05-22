package com.back.global.jpa

import com.back.global.security.model.AuthSecurityEvent
import jakarta.persistence.Table
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path

class AuthUnusedIndexPruneMigrationContractTest {
    private val migrationSql: String =
        Files.readString(
            Path.of("src/main/resources/db/migration/V20260523_04__drop_unused_auth_session_indexes.sql"),
        )

    @Test
    fun `운영에서 미사용으로 확인된 auth session 인덱스를 제거한다`() {
        val droppedIndexes =
            listOf(
                "idx_auth_security_event_event_type_created_at",
                "idx_auth_security_event_member_created_at",
                "member_session_idx_member_session_active",
            )

        droppedIndexes.forEach { indexName ->
            assertThat(migrationSql).contains("DROP INDEX IF EXISTS public.$indexName")
        }
        assertThat(migrationSql).doesNotContain("member_session_idx_member_active_recent")
    }

    @Test
    fun `AuthSecurityEvent JPA metadata는 유지 인덱스만 선언한다`() {
        val indexNames =
            AuthSecurityEvent::class.java
                .getAnnotation(Table::class.java)
                .indexes
                .map { it.name }

        assertThat(indexNames).containsExactly("idx_auth_security_event_created_at")
    }
}
