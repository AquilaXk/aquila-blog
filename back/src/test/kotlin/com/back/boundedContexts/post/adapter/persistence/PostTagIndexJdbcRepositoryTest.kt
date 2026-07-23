package com.back.boundedContexts.post.adapter.persistence

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyInt
import org.mockito.ArgumentMatchers.anyList
import org.mockito.ArgumentMatchers.anyString
import org.mockito.ArgumentMatchers.eq
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.mock
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.springframework.dao.DataAccessResourceFailureException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.ParameterizedPreparedStatementSetter
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionException
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus

@DisplayName("PostTagIndexJdbcRepository replace 트랜잭션")
class PostTagIndexJdbcRepositoryTest {
    @Test
    @DisplayName("insert 실패 시 트랜잭션을 rollback 하고 wipe 상태를 남기지 않는다")
    fun rollsBackWhenInsertFailsAfterDelete() {
        val jdbcTemplate = mock(JdbcTemplate::class.java)
        val transactionManager = TrackingTransactionManager()
        `when`(
            jdbcTemplate.queryForObject(
                "SELECT to_regclass('public.post_tag_index') IS NOT NULL",
                Boolean::class.java,
            ),
        ).thenReturn(true)
        `when`(jdbcTemplate.update(anyString(), eq(10L))).thenReturn(1)
        doThrow(DataAccessResourceFailureException("insert failed"))
            .`when`(jdbcTemplate)
            .batchUpdate(
                anyString(),
                anyList(),
                anyInt(),
                any<ParameterizedPreparedStatementSetter<String>>(),
            )

        val repository = PostTagIndexJdbcRepository(jdbcTemplate, transactionManager)

        repository.replacePostTags(10L, listOf("kotlin"))

        assertThat(transactionManager.rollbackCount).isEqualTo(1)
        assertThat(transactionManager.commitCount).isEqualTo(0)
        assertThat(transactionManager.lastPropagation).isEqualTo(TransactionDefinition.PROPAGATION_REQUIRES_NEW)
        verify(jdbcTemplate, times(1)).update(anyString(), eq(10L))
        verify(jdbcTemplate, times(1)).batchUpdate(
            anyString(),
            anyList(),
            anyInt(),
            any<ParameterizedPreparedStatementSetter<String>>(),
        )

        // marked unavailable after failure; subsequent replace is a no-op
        repository.replacePostTags(10L, listOf("spring"))
        verify(jdbcTemplate, times(1)).update(anyString(), eq(10L))
        verify(jdbcTemplate, times(1)).batchUpdate(
            anyString(),
            anyList(),
            anyInt(),
            any<ParameterizedPreparedStatementSetter<String>>(),
        )
    }

    private class TrackingTransactionManager : PlatformTransactionManager {
        var commitCount = 0
        var rollbackCount = 0
        var lastPropagation: Int? = null

        override fun getTransaction(definition: TransactionDefinition?): TransactionStatus {
            lastPropagation = definition?.propagationBehavior
            return SimpleTransactionStatus()
        }

        @Throws(TransactionException::class)
        override fun commit(status: TransactionStatus) {
            commitCount += 1
        }

        @Throws(TransactionException::class)
        override fun rollback(status: TransactionStatus) {
            rollbackCount += 1
        }
    }
}
