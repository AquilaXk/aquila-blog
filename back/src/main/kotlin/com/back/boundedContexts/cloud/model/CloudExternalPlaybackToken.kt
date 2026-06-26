package com.back.boundedContexts.cloud.model

import com.back.global.jpa.domain.BaseTime
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType.SEQUENCE
import jakarta.persistence.Id
import jakarta.persistence.SequenceGenerator
import org.hibernate.annotations.DynamicUpdate
import java.time.Instant

enum class CloudExternalPlaybackTokenPurpose {
    EXTERNAL_PLAYBACK,
}

@Entity
@DynamicUpdate
class CloudExternalPlaybackToken(
    @field:Id
    @field:SequenceGenerator(
        name = "cloud_external_playback_token_seq_gen",
        sequenceName = "cloud_external_playback_token_seq",
        allocationSize = 1,
    )
    @field:GeneratedValue(strategy = SEQUENCE, generator = "cloud_external_playback_token_seq_gen")
    override val id: Long = 0,
    @field:Column(nullable = false, unique = true, length = 64)
    val tokenHash: String,
    @field:Column(nullable = false)
    val fileId: Long,
    @field:Column(nullable = false)
    val memberId: Long,
    @field:Enumerated(EnumType.STRING)
    @field:Column(nullable = false, length = 40)
    val purpose: CloudExternalPlaybackTokenPurpose,
    @field:Column(nullable = false)
    val expiresAt: Instant,
) : BaseTime(id) {
    companion object {
        fun create(
            tokenHash: String,
            fileId: Long,
            memberId: Long,
            purpose: CloudExternalPlaybackTokenPurpose,
            expiresAt: Instant,
        ): CloudExternalPlaybackToken =
            CloudExternalPlaybackToken(
                tokenHash = tokenHash,
                fileId = fileId,
                memberId = memberId,
                purpose = purpose,
                expiresAt = expiresAt,
            )
    }
}
