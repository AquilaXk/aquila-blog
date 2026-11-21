package com.back.architecture

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path

@DisplayName("운영 Hibernate JDBC 로그 수준 계약")
class ProdHibernateJdbcLogLevelContractTest {
    @Test
    fun `application-prod yaml keeps JDBC bind extract batch at WARN or higher`() {
        val yaml =
            Files.readString(
                Path.of("src/main/resources/application-prod.yaml"),
            )
        for (logger in listOf(
            "org.hibernate.orm.jdbc.bind",
            "org.hibernate.orm.jdbc.extract",
            "org.hibernate.orm.jdbc.batch",
        )) {
            val pattern = Regex("""(?m)^\s*${Regex.escape(logger)}:\s*(\S+)\s*$""")
            val level = pattern.find(yaml)?.groupValues?.get(1)
            assertTrue(
                level.equals("WARN", ignoreCase = true) ||
                    level.equals("ERROR", ignoreCase = true) ||
                    level.equals("OFF", ignoreCase = true),
                "expected $logger to be WARN/ERROR/OFF but was $level",
            )
        }
    }
}
