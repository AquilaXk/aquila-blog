package com.back.standard.dto

import java.time.Instant

interface TaskPayload : Payload

interface ExpiringTaskPayload : TaskPayload {
    val expiresAt: Instant
}
