package com.back.global.storage.config

import org.springframework.boot.context.properties.ConfigurationProperties

/** 직접 업로드 기본 상한 = Cloudflare edge 실효 payload(≈95 MiB). */
const val DEFAULT_CLOUD_DOCUMENT_MAX_SIZE_BYTES: Long = CloudTransferLimits.EFFECTIVE_PAYLOAD_MAX_BYTES
const val DEFAULT_CLOUD_PHOTO_MAX_SIZE_BYTES: Long = 50L * 1024 * 1024
const val DEFAULT_CLOUD_VIDEO_RESUMABLE_MAX_SIZE_BYTES: Long = 5L * 1024 * 1024 * 1024
const val DEFAULT_CLOUD_VIDEO_RESUMABLE_PART_SIZE_BYTES: Long = 64L * 1024 * 1024
const val DEFAULT_CLOUD_VIDEO_RESUMABLE_EXPIRES_SECONDS: Long = 24L * 60 * 60

/** Part 활동 sliding 연장의 절대 상한. MinIO `MINIO_API_STALE_UPLOADS_EXPIRY`(8d)보다 짧게(7d) 유지한다. */
const val DEFAULT_CLOUD_VIDEO_RESUMABLE_ABSOLUTE_MAX_SECONDS: Long = 7L * 24 * 60 * 60

/** 운영 MinIO stale multipart 만료(초). 앱 절대 상한은 이 값보다 margin 이상 짧아야 한다. */
const val MINIO_STALE_UPLOADS_EXPIRY_SECONDS: Long = 8L * 24 * 60 * 60

const val CLOUD_VIDEO_RESUMABLE_ABSOLUTE_MAX_MINIO_MARGIN_SECONDS: Long = 24L * 60 * 60
const val DEFAULT_CLOUD_VIDEO_RESUMABLE_STALE_INITIATING_GRACE_SECONDS: Long = 15L * 60
const val DEFAULT_CLOUD_VIDEO_RESUMABLE_STALE_COMPLETING_GRACE_SECONDS: Long = 30L * 60
const val DEFAULT_CLOUD_VIDEO_RESUMABLE_STALE_UPLOADING_PART_GRACE_SECONDS: Long = 60L * 60
const val DEFAULT_CLOUD_RECONCILE_OBJECT_GRACE_SECONDS: Long = 24L * 60 * 60
const val DEFAULT_CLOUD_RECONCILE_INVENTORY_LIMIT: Int = 1_000
const val DEFAULT_CLOUD_RECONCILE_SAFETY_THRESHOLD: Int = 25

@ConfigurationProperties("custom.storage")
data class CloudStorageProperties(
    var enabled: Boolean = false,
    var endpoint: String = "http://localhost:9000",
    var region: String = "us-east-1",
    var bucket: String = "blog-images",
    var accessKey: String = "",
    var secretKey: String = "",
    var pathStyleAccess: Boolean = true,
    var cloudKeyPrefix: String = "cloud",
    var maxFileSizeBytes: Long = DEFAULT_CLOUD_DOCUMENT_MAX_SIZE_BYTES,
    var cloudDocumentMaxFileSizeBytes: Long = maxFileSizeBytes,
    var cloudPhotoMaxFileSizeBytes: Long = DEFAULT_CLOUD_PHOTO_MAX_SIZE_BYTES,
    var cloudArchiveMaxFileSizeBytes: Long = maxFileSizeBytes,
    var cloudVideoMaxFileSizeBytes: Long = maxFileSizeBytes,
    var cloudVideoResumableMaxFileSizeBytes: Long = DEFAULT_CLOUD_VIDEO_RESUMABLE_MAX_SIZE_BYTES,
    var cloudVideoResumablePartSizeBytes: Long = DEFAULT_CLOUD_VIDEO_RESUMABLE_PART_SIZE_BYTES,
    /** Part 성공 시 sliding 연장 창(기본 24h). */
    var cloudVideoResumableExpiresSeconds: Long = DEFAULT_CLOUD_VIDEO_RESUMABLE_EXPIRES_SECONDS,
    /**
     * 세션 절대 최대 수명(기본 7d).
     * 반드시 MinIO `MINIO_API_STALE_UPLOADS_EXPIRY`(8d) − margin(1d) 이하여야 한다.
     */
    var cloudVideoResumableAbsoluteMaxSeconds: Long = DEFAULT_CLOUD_VIDEO_RESUMABLE_ABSOLUTE_MAX_SECONDS,
    var cloudVideoResumableStaleInitiatingGraceSeconds: Long = DEFAULT_CLOUD_VIDEO_RESUMABLE_STALE_INITIATING_GRACE_SECONDS,
    var cloudVideoResumableStaleCompletingGraceSeconds: Long = DEFAULT_CLOUD_VIDEO_RESUMABLE_STALE_COMPLETING_GRACE_SECONDS,
    var cloudVideoResumableStaleUploadingPartGraceSeconds: Long = DEFAULT_CLOUD_VIDEO_RESUMABLE_STALE_UPLOADING_PART_GRACE_SECONDS,
    var cloudReconcileInventoryLimit: Int = DEFAULT_CLOUD_RECONCILE_INVENTORY_LIMIT,
    var cloudReconcileObjectGraceSeconds: Long = DEFAULT_CLOUD_RECONCILE_OBJECT_GRACE_SECONDS,
    var cloudReconcileSafetyThreshold: Int = DEFAULT_CLOUD_RECONCILE_SAFETY_THRESHOLD,
    var cloudReconcileRepairEnabled: Boolean = false,
    var cloudReconcileMetricsRefreshEnabled: Boolean = true,
) {
    fun validateResumableLifetimeAgainstMinioStaleExpiry() {
        val sliding = cloudVideoResumableExpiresSeconds.coerceAtLeast(60)
        val absoluteMax = cloudVideoResumableAbsoluteMaxSeconds.coerceAtLeast(sliding)
        val maxAllowed = MINIO_STALE_UPLOADS_EXPIRY_SECONDS - CLOUD_VIDEO_RESUMABLE_ABSOLUTE_MAX_MINIO_MARGIN_SECONDS
        require(absoluteMax <= maxAllowed) {
            "custom.storage.cloudVideoResumableAbsoluteMaxSeconds($absoluteMax) must be <= " +
                "MinIO stale_uploads_expiry($MINIO_STALE_UPLOADS_EXPIRY_SECONDS) - " +
                "margin($CLOUD_VIDEO_RESUMABLE_ABSOLUTE_MAX_MINIO_MARGIN_SECONDS)"
        }
        require(absoluteMax >= sliding) {
            "custom.storage.cloudVideoResumableAbsoluteMaxSeconds($absoluteMax) must be >= " +
                "cloudVideoResumableExpiresSeconds($sliding)"
        }
    }

    /**
     * 단일 요청 경로(직접 업로드·resumable part)가 Cloudflare edge 실효 상한을 넘지 않는지 검증한다.
     * resumable 전체 파일 상한(5GB)은 part 단위 전송이므로 여기서 검사하지 않는다.
     */
    fun validateAgainstEdgeTransferLimits() {
        CloudTransferLimits.validate(
            partSizeBytes = cloudVideoResumablePartSizeBytes,
            directUploadLimits =
                listOf(
                    "maxFileSizeBytes" to maxFileSizeBytes,
                    "cloudDocumentMaxFileSizeBytes" to cloudDocumentMaxFileSizeBytes,
                    "cloudPhotoMaxFileSizeBytes" to cloudPhotoMaxFileSizeBytes,
                    "cloudArchiveMaxFileSizeBytes" to cloudArchiveMaxFileSizeBytes,
                    "cloudVideoMaxFileSizeBytes" to cloudVideoMaxFileSizeBytes,
                ),
        )
    }
}
