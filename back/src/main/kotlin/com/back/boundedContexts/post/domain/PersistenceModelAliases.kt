package com.back.boundedContexts.post.domain

// Legacy bridge only: these names still point to persistence entities.
// ArchitectureGuardTest owns the allowlist so new model aliases need an explicit boundary decision.
typealias Post = com.back.boundedContexts.post.model.Post
typealias PostAttr = com.back.boundedContexts.post.model.PostAttr
typealias PostComment = com.back.boundedContexts.post.model.PostComment
typealias PostLike = com.back.boundedContexts.post.model.PostLike
typealias PostWriteRequestIdempotency = com.back.boundedContexts.post.model.PostWriteRequestIdempotency
