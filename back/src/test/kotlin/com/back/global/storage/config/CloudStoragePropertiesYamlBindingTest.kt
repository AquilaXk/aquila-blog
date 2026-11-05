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
            "bucket: \${CUSTOM_STORAGE_BUCKET:}",
        )
        assertThat(applicationYaml).contains(
            "cloudBucket: \${CUSTOM_STORAGE_CLOUD_BUCKET:}",
        )
        assertThat(applicationYaml).contains(
            "cloudVideoResumableAbsoluteMaxSeconds: \${CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_ABSOLUTEMAXSECONDS:604800}",
        )
        assertThat(applicationYaml).contains(
            "cloudVideoResumableStaleUploadingPartGraceSeconds: " +
                "\${CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_STALEUPLOADINGPARTGRACESECONDS:604800}",
        )
    }

    @Test
    @DisplayName("resolvedCloudBucket은 전용 cloudBucket이 설정되면 이를 사용하고 비어 있으면 기본 bucket으로 폴백한다")
    fun `resolvedCloudBucket prefers configured cloudBucket and falls back to bucket when blank`() {
        val fallbackProps = CloudStorageProperties(bucket = " blog-images ", cloudBucket = "   ")
        assertThat(fallbackProps.resolvedCloudBucket).isEqualTo("blog-images")

        val dedicatedProps = CloudStorageProperties(bucket = "blog-images", cloudBucket = " blog-cloud-private ")
        assertThat(dedicatedProps.resolvedCloudBucket).isEqualTo("blog-cloud-private")
    }
}
