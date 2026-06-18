package com.back.boundedContexts.post.application.service

import com.back.standard.dto.EventPayload

internal data class PostWriteAfterCommitEvent(
    val command: PostWriteSideEffectCommand,
    val domainEvent: EventPayload?,
)
