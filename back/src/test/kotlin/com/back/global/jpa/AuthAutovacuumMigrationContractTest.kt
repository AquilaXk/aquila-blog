package com.back.global.jpa

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path

class AuthAutovacuumMigrationContractTest {
    private val migrationSql: String =
        Files.readString(
            Path.of("src/main/resources/db/migration/V20260523_03__tune_auth_table_autovacuum.sql"),
        )

    @Test
    fun `auth high churn 테이블은 table level autovacuum 설정을 가진다`() {
        assertRelOptions("member_session")
        assertRelOptions("auth_security_event")
    }

    private fun assertRelOptions(tableName: String) {
        assertThat(migrationSql).contains("ALTER TABLE public.$tableName SET")
        assertThat(migrationSql).contains("autovacuum_vacuum_scale_factor = 0.05")
        assertThat(migrationSql).contains("autovacuum_analyze_scale_factor = 0.02")
        assertThat(migrationSql).contains("autovacuum_vacuum_threshold = 50")
        assertThat(migrationSql).contains("autovacuum_analyze_threshold = 50")
    }
}
