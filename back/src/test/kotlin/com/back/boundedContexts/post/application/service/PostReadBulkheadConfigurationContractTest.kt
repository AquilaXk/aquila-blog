package com.back.boundedContexts.post.application.service

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.boot.env.YamlPropertySourceLoader
import org.springframework.core.io.ClassPathResource

class PostReadBulkheadConfigurationContractTest {
    @Test
    fun `post read bulkhead YAML properties remain nested under bulkhead`() {
        val properties =
            YamlPropertySourceLoader()
                .load("application.yaml", ClassPathResource("application.yaml"))
                .single()

        assertThat(properties.getProperty("custom.post.read.bulkhead.detailMaxConcurrent"))
            .isEqualTo("\${CUSTOM__POST__READ__BULKHEAD__DETAIL_MAX_CONCURRENT:16}")
        assertThat(properties.getProperty("custom.post.read.bulkhead.tagsMaxConcurrent"))
            .isEqualTo("\${CUSTOM__POST__READ__BULKHEAD__TAGS_MAX_CONCURRENT:6}")
        assertThat(properties.getProperty("custom.post.read.detailMaxConcurrent")).isNull()
        assertThat(properties.getProperty("custom.post.read.tagsMaxConcurrent")).isNull()
    }
}
