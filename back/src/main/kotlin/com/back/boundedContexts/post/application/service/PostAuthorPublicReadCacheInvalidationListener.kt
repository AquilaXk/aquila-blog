package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.application.event.MemberPublicProfileChangedEvent
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener

@Component
class PostAuthorPublicReadCacheInvalidationListener(
    private val postReadCacheInvalidator: PostReadCacheInvalidator,
) {
    private val logger = LoggerFactory.getLogger(PostAuthorPublicReadCacheInvalidationListener::class.java)

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    fun handle(event: MemberPublicProfileChangedEvent) {
        runCatching {
            postReadCacheInvalidator.invalidateAuthorRepresentation("author-representation")
        }.onFailure { exception ->
            logger.warn("Failed to evict post read caches after author update: memberId={}", event.memberId, exception)
        }
    }
}
