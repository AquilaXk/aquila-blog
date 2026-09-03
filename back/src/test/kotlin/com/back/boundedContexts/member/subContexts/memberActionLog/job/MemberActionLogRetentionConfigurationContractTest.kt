package com.back.boundedContexts.member.subContexts.memberActionLog.job

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.boot.env.YamlPropertySourceLoader
import org.springframework.core.io.ClassPathResource

class MemberActionLogRetentionConfigurationContractTest {
    @Test
    fun `retention YAML properties have direct current owners without privacy aliases`() {
        val properties =
            YamlPropertySourceLoader()
                .load("application.yaml", ClassPathResource("application.yaml"))
                .single()
        val yaml = ClassPathResource("application.yaml").inputStream.bufferedReader().use { it.readText() }

        assertThat(properties.getProperty("custom.auth.session.revokedRetentionDays"))
            .isEqualTo("\${CUSTOM__AUTH__SESSION__REVOKED_RETENTION_DAYS:30}")
        assertThat(properties.getProperty("custom.auth.securityEvent.retentionDays"))
            .isEqualTo("\${CUSTOM__AUTH__SECURITY_EVENT__RETENTION_DAYS:30}")
        assertThat(properties.getProperty("custom.memberActionLog.retention.days"))
            .isEqualTo("\${CUSTOM__MEMBER_ACTION_LOG__RETENTION__DAYS:90}")
        assertThat(properties.getProperty("custom.memberActionLog.retention.cleanup.batchSize"))
            .isEqualTo("\${CUSTOM__MEMBER_ACTION_LOG__RETENTION__CLEANUP__BATCH_SIZE:500}")
        assertThat(properties.getProperty("custom.memberActionLog.retention.cleanup.maxBatches"))
            .isEqualTo("\${CUSTOM__MEMBER_ACTION_LOG__RETENTION__CLEANUP__MAX_BATCHES:20}")
        assertThat(properties.getProperty("custom.memberActionLog.retention.cleanup.fixedDelayMs"))
            .isEqualTo("\${CUSTOM__MEMBER_ACTION_LOG__RETENTION__CLEANUP__FIXED_DELAY_MS:3600000}")
        assertThat(yaml).doesNotContain("privacy.retention", "CUSTOM__PRIVACY__RETENTION")
    }
}
