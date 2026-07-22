package com.back.global.storage.config

import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("CloudTransferLimits 테스트")
class CloudTransferLimitsTest {
    @Test
    @DisplayName("기본 part·직접 업로드 한도는 edge 실효 상한 이하면 통과한다")
    fun acceptsDefaultLimitsWithinEffectiveEdge() {
        assertThatCode {
            CloudStorageProperties().validateAgainstEdgeTransferLimits()
        }.doesNotThrowAnyException()
    }

    @Test
    @DisplayName("실효 상한과 같은 part size는 통과한다")
    fun acceptsPartSizeAtEffectiveLimit() {
        assertThatCode {
            CloudTransferLimits.validate(
                partSizeBytes = CloudTransferLimits.EFFECTIVE_PAYLOAD_MAX_BYTES,
                directUploadLimits =
                    listOf(
                        "maxFileSizeBytes" to CloudTransferLimits.EFFECTIVE_PAYLOAD_MAX_BYTES,
                    ),
            )
        }.doesNotThrowAnyException()
    }

    @Test
    @DisplayName("part size가 edge − overhead를 넘으면 실패한다")
    fun rejectsOversizedPartSize() {
        assertThatThrownBy {
            CloudTransferLimits.validate(
                partSizeBytes = CloudTransferLimits.EFFECTIVE_PAYLOAD_MAX_BYTES + 1,
                directUploadLimits =
                    listOf(
                        "maxFileSizeBytes" to CloudTransferLimits.EFFECTIVE_PAYLOAD_MAX_BYTES,
                    ),
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("cloudVideoResumablePartSizeBytes")
            .hasMessageContaining("edge payload limit")
    }

    @Test
    @DisplayName("직접 업로드 한도가 edge − overhead를 넘으면 실패한다")
    fun rejectsOversizedDirectUploadLimit() {
        assertThatThrownBy {
            CloudStorageProperties(
                maxFileSizeBytes = CloudTransferLimits.EDGE_MAX_REQUEST_BYTES,
                cloudDocumentMaxFileSizeBytes = CloudTransferLimits.EDGE_MAX_REQUEST_BYTES,
                cloudArchiveMaxFileSizeBytes = CloudTransferLimits.EDGE_MAX_REQUEST_BYTES,
                cloudVideoMaxFileSizeBytes = CloudTransferLimits.EDGE_MAX_REQUEST_BYTES,
            ).validateAgainstEdgeTransferLimits()
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("maxFileSizeBytes")
            .hasMessageContaining("edge payload limit")
    }

    @Test
    @DisplayName("photo 한도만 초과해도 실패한다")
    fun rejectsOversizedPhotoLimitAlone() {
        assertThatThrownBy {
            CloudStorageProperties(
                cloudPhotoMaxFileSizeBytes = CloudTransferLimits.EFFECTIVE_PAYLOAD_MAX_BYTES + 1,
            ).validateAgainstEdgeTransferLimits()
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("cloudPhotoMaxFileSizeBytes")
    }
}
