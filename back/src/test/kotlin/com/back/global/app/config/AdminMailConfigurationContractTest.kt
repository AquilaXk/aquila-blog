package com.back.global.app.config

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.boot.env.YamlPropertySourceLoader
import org.springframework.core.io.ClassPathResource

class AdminMailConfigurationContractTest {
    @Test
    fun `admin mail YAML keeps TLS identity and bounded timeout defaults fail closed`() {
        val properties =
            YamlPropertySourceLoader()
                .load("application.yaml", ClassPathResource("application.yaml"))
                .single()

        assertThat(properties.getProperty("spring.mail.username"))
            .isEqualTo("\${SPRING__MAIL__USERNAME:}")
        assertThat(properties.getProperty("spring.mail.properties.mail.smtp.starttls.enable"))
            .isEqualTo("\${SPRING__MAIL__PROPERTIES__MAIL__SMTP__STARTTLS__ENABLE:true}")
        assertThat(properties.getProperty("spring.mail.properties.mail.smtp.starttls.required"))
            .isEqualTo("\${SPRING__MAIL__PROPERTIES__MAIL__SMTP__STARTTLS__REQUIRED:true}")
        assertThat(properties.getProperty("spring.mail.properties.mail.smtp.ssl.checkserveridentity"))
            .isEqualTo("\${SPRING__MAIL__PROPERTIES__MAIL__SMTP__SSL__CHECKSERVERIDENTITY:true}")
        assertThat(properties.getProperty("spring.mail.properties.mail.smtp.connectiontimeout"))
            .isEqualTo("\${SPRING__MAIL__PROPERTIES__MAIL__SMTP__CONNECTIONTIMEOUT:5000}")
        assertThat(properties.getProperty("spring.mail.properties.mail.smtp.timeout"))
            .isEqualTo("\${SPRING__MAIL__PROPERTIES__MAIL__SMTP__TIMEOUT:8000}")
        assertThat(properties.getProperty("spring.mail.properties.mail.smtp.writetimeout"))
            .isEqualTo("\${SPRING__MAIL__PROPERTIES__MAIL__SMTP__WRITETIMEOUT:8000}")
        assertThat(properties.getProperty("custom.auth.adminEmail.requestDeadlineMillis"))
            .isEqualTo("\${CUSTOM__AUTH__ADMIN_EMAIL__REQUEST_DEADLINE_MILLIS:10000}")
    }
}
