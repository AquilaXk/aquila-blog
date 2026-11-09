package com.back.global.task.adapter.persistence

import com.back.boundedContexts.member.subContexts.memberActionLog.adapter.event.MemberActionLogEventListener
import com.back.boundedContexts.post.adapter.event.PostReadModelTaskEventListener
import com.back.global.revalidate.adapter.event.CdnCachePurgeEventListener
import com.back.global.revalidate.adapter.event.RevalidateEventListener
import com.back.global.task.application.port.output.TaskQueueInsertResult
import com.back.global.task.domain.Task
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener
import java.time.Instant
import java.util.UUID

class TaskAtomicInsertStoreTest {
    @Test
    fun `atomic insert는 affected row count로 inserted와 duplicate를 구분한다`() {
        assertThat(TaskAtomicInsertStore(FixedRowCountJdbcTemplate(1)).insertIfAbsent(task()))
            .isEqualTo(TaskQueueInsertResult.INSERTED)
        assertThat(
            TaskAtomicInsertStore(FixedRowCountJdbcTemplate(0)).insertIfAbsent(
                task(payloadExpiresAt = Instant.parse("2026-08-12T00:00:00Z")),
            ),
        ).isEqualTo(TaskQueueInsertResult.DUPLICATE)
    }

    @Test
    fun `atomic insert는 불가능한 affected row count를 fail closed한다`() {
        val store = TaskAtomicInsertStore(FixedRowCountJdbcTemplate(2))

        assertThatThrownBy { store.insertIfAbsent(task()) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessage("Atomic task insert must affect zero or one row, actual=2")
    }

    @Test
    fun `insertIfAbsent는 Transactional Outbox 원자성을 위해 REQUIRED를 유지하고 AFTER_COMMIT 리스너가 REQUIRES_NEW를 선언한다`() {
        val method = TaskAtomicInsertStore::class.java.getDeclaredMethod("insertIfAbsent", Task::class.java)
        val transactional = method.getAnnotation(Transactional::class.java)

        assertThat(transactional).isNotNull
        assertThat(transactional.propagation).isEqualTo(Propagation.REQUIRED)

        val listenerClasses =
            listOf(
                RevalidateEventListener::class.java,
                CdnCachePurgeEventListener::class.java,
                PostReadModelTaskEventListener::class.java,
                MemberActionLogEventListener::class.java,
            )
        listenerClasses.forEach { listenerClass ->
            val afterCommitMethods =
                listenerClass.declaredMethods.filter { candidate ->
                    candidate.getAnnotation(TransactionalEventListener::class.java)?.phase == TransactionPhase.AFTER_COMMIT
                }
            assertThat(afterCommitMethods).isNotEmpty
            afterCommitMethods.forEach { afterCommitMethod ->
                val methodTx = afterCommitMethod.getAnnotation(Transactional::class.java)
                assertThat(methodTx)
                    .withFailMessage("${listenerClass.simpleName}.${afterCommitMethod.name} must declare @Transactional(REQUIRES_NEW)")
                    .isNotNull
                assertThat(methodTx.propagation).isEqualTo(Propagation.REQUIRES_NEW)
            }
        }
    }

    private fun task(payloadExpiresAt: Instant? = null): Task =
        Task(
            uid = UUID.randomUUID(),
            aggregateType = "test",
            aggregateId = 1,
            taskType = "test.atomic",
            payload = "{}",
            payloadExpiresAt = payloadExpiresAt,
            nextRetryAt = Instant.parse("2026-08-11T00:00:00Z"),
        )

    private class FixedRowCountJdbcTemplate(
        private val rowCount: Int,
    ) : JdbcTemplate() {
        override fun update(
            sql: String,
            vararg args: Any?,
        ): Int = rowCount
    }
}
