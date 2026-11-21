package com.back.global.storage.application

import com.back.global.storage.application.port.output.CloudStoragePort

/**
 * Multipart complete 이후 스토리지에 객체가 실제로 커밋됐는지 HeadObject로 판정한다.
 * #1226 COMPLETING stale 회수에서 도입하며, #1227 reconcile/idempotency가 동일 기준을 재사용한다.
 */
object CloudMultipartCommitDetector {
    fun isCommitted(
        head: CloudStoragePort.ObjectHead?,
        expectedByteSize: Long,
    ): Boolean = head != null && head.contentLength == expectedByteSize
}
