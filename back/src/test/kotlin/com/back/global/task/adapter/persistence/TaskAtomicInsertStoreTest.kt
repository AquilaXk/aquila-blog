package com.back.global.task.adapter.persistence

import com.back.global.task.application.port.output.TaskQueueInsertResult
import com.back.global.task.domain.Task
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import java.time.Instant
import java.util.UUID

class TaskAtomicInsertStoreTest {
    @Test
    fun `atomic insert는 affected row count로 inserted와 duplicate를 구분한다`() {
        assertThat(TaskAtomicInsertStore(FixedRowCountJdbcTemplate(1)).insertIfAbsent(task()))
            .isEqualTo(TaskQueueInsertResult.INSERTED)
        assertThat(TaskAtomicInsertStore(FixedRowCountJdbcTemplate(0)).insertIfAbsent(task()))
            .isEqualTo(TaskQueueInsertResult.DUPLICATE)
    }

    @Test
    fun `atomic insert는 불가능한 affected row count를 fail closed한다`() {
        val store = TaskAtomicInsertStore(FixedRowCountJdbcTemplate(2))

        assertThatThrownBy { store.insertIfAbsent(task()) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessage("Atomic task insert must affect zero or one row, actual=2")
    }

    private fun task(): Task =
        Task(
            uid = UUID.randomUUID(),
            aggregateType = "test",
            aggregateId = 1,
            taskType = "test.atomic",
            payload = "{}",
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
