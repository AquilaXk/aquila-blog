package com.back.global.storage.application

import com.back.global.storage.application.port.output.CloudStoragePort
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("CloudMultipartCommitDetector 테스트")
class CloudMultipartCommitDetectorTest {
    @Test
    @DisplayName("object가 존재하고 contentLength가 세션 byteSize와 같으면 커밋으로 본다")
    fun committedWhenLengthMatches() {
        val head =
            CloudStoragePort.ObjectHead(
                objectKey = "cloud/7/video.mp4",
                contentLength = 1024,
                contentType = "video/mp4",
                eTag = "etag",
            )

        assertThat(CloudMultipartCommitDetector.isCommitted(head, expectedByteSize = 1024)).isTrue()
    }

    @Test
    @DisplayName("object가 없거나 contentLength가 다르면 미커밋으로 본다")
    fun notCommittedWhenMissingOrLengthMismatch() {
        val head =
            CloudStoragePort.ObjectHead(
                objectKey = "cloud/7/video.mp4",
                contentLength = 1000,
                contentType = "video/mp4",
                eTag = "etag",
            )

        assertThat(CloudMultipartCommitDetector.isCommitted(null, expectedByteSize = 1024)).isFalse()
        assertThat(CloudMultipartCommitDetector.isCommitted(head, expectedByteSize = 1024)).isFalse()
    }
}
