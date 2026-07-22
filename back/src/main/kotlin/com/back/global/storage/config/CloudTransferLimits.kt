package com.back.global.storage.config

/**
 * Cloudflare edge → Tunnel → Caddy → Spring 경로의 전송 본문 상한.
 * edge가 실효 상한이며, multipart 폼 오버헤드 여유를 빼 실효 payload 상한을 둔다.
 */
object CloudTransferLimits {
    /** Cloudflare free plan 요청 본문 상한(100 MiB). */
    const val EDGE_MAX_REQUEST_BYTES: Long = 100L * 1024 * 1024

    /** multipart boundary/header 등 오버헤드 여유. */
    const val MULTIPART_OVERHEAD_MARGIN_BYTES: Long = 5L * 1024 * 1024

    /** 직접 업로드·part size 실효 상한(edge − overhead ≈ 95 MiB). */
    const val EFFECTIVE_PAYLOAD_MAX_BYTES: Long =
        EDGE_MAX_REQUEST_BYTES - MULTIPART_OVERHEAD_MARGIN_BYTES

    fun validate(
        partSizeBytes: Long,
        directUploadLimits: List<Pair<String, Long>>,
    ) {
        require(partSizeBytes > 0) {
            "custom.storage.cloudVideoResumablePartSizeBytes($partSizeBytes) must be > 0"
        }
        require(partSizeBytes <= EFFECTIVE_PAYLOAD_MAX_BYTES) {
            "custom.storage.cloudVideoResumablePartSizeBytes($partSizeBytes) must be <= " +
                "edge payload limit($EFFECTIVE_PAYLOAD_MAX_BYTES) " +
                "(Cloudflare edge $EDGE_MAX_REQUEST_BYTES - overhead $MULTIPART_OVERHEAD_MARGIN_BYTES)"
        }
        directUploadLimits.forEach { (name, bytes) ->
            require(bytes > 0) {
                "custom.storage.$name($bytes) must be > 0"
            }
            require(bytes <= EFFECTIVE_PAYLOAD_MAX_BYTES) {
                "custom.storage.$name($bytes) must be <= " +
                    "edge payload limit($EFFECTIVE_PAYLOAD_MAX_BYTES) " +
                    "(Cloudflare edge $EDGE_MAX_REQUEST_BYTES - overhead $MULTIPART_OVERHEAD_MARGIN_BYTES)"
            }
        }
    }
}
