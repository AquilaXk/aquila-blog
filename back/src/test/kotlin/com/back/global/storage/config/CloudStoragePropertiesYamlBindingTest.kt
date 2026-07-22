package com.back.global.storage.config

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("CloudStorageProperties yaml 바인딩 계약 테스트")
class CloudStoragePropertiesYamlBindingTest {
    @Test
    @DisplayName("resumable absolute max seconds env 키가 application yaml에 매핑된다")
    fun `resumable absolute max seconds env 키가 application yaml에 매핑된다`() {
        val applicationYaml =
            checkNotNull(Thread.currentThread().contextClassLoader.getResource("application.yaml")) {
                "application.yaml resource not found"
            }.readText()

        assertThat(applicationYaml).contains(
            "cloudVideoResumableAbsoluteMaxSeconds: \${CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_ABSOLUTEMAXSECONDS:604800}",
        )
    }
}
