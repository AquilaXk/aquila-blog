package com.back.boundedContexts.cloud.application.port.output

import com.back.boundedContexts.cloud.model.CloudExternalPlaybackToken
import com.back.boundedContexts.cloud.model.CloudExternalPlaybackTokenPurpose
import java.time.Instant

interface CloudExternalPlaybackTokenRepositoryPort {
    fun save(token: CloudExternalPlaybackToken): CloudExternalPlaybackToken

    fun findValid(
        tokenHash: String,
        fileId: Long,
        purpose: CloudExternalPlaybackTokenPurpose,
        now: Instant,
    ): CloudExternalPlaybackToken?
}
