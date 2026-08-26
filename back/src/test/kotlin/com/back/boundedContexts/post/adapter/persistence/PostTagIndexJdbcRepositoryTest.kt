package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.post.application.port.output.PostTagIndexRepositoryPort
import org.assertj.core.api.Assertions.assertThatThrownBy
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
import org.springframework.jdbc.core.RowMapper

@DisplayName("PostTagIndexJdbcRepository replace 트랜잭션")
class PostTagIndexJdbcRepositoryTest {
    @Test
    @DisplayName("insert 실패는 caller transaction으로 전파하고 이후 호출도 숨기지 않는다")
    fun propagatesInsertFailureWithoutDisablingCanonicalPath() {
        val jdbcTemplate = mock(JdbcTemplate::class.java)
        `when`(
            jdbcTemplate.query(
                anyString(),
                any<RowMapper<PostTagIndexRepositoryPort.LockedPostSource>>(),
                eq(10L),
            ),
        ).thenReturn(listOf(PostTagIndexRepositoryPort.LockedPostSource("content", deleted = false)))
        `when`(jdbcTemplate.update(anyString(), eq(10L))).thenReturn(1)
        doThrow(DataAccessResourceFailureException("insert failed"))
            .`when`(jdbcTemplate)
            .batchUpdate(
                anyString(),
                anyList(),
                anyInt(),
                any<ParameterizedPreparedStatementSetter<String>>(),
            )

        val repository = PostTagIndexJdbcRepository(jdbcTemplate)

        assertThatThrownBy { repository.replacePostTags(10L, listOf("kotlin")) }
            .isInstanceOf(DataAccessResourceFailureException::class.java)

        verify(jdbcTemplate, times(1)).update(anyString(), eq(10L))
        verify(jdbcTemplate, times(1)).batchUpdate(
            anyString(),
            anyList(),
            anyInt(),
            any<ParameterizedPreparedStatementSetter<String>>(),
        )

        assertThatThrownBy { repository.replacePostTags(10L, listOf("spring")) }
            .isInstanceOf(DataAccessResourceFailureException::class.java)
        verify(jdbcTemplate, times(2)).update(anyString(), eq(10L))
    }

    @Test
    @DisplayName("missing post는 empty replace만 idempotent하게 허용한다")
    fun allowsOnlyEmptyReplaceForMissingPost() {
        val jdbcTemplate = mock(JdbcTemplate::class.java)
        `when`(
            jdbcTemplate.query(
                anyString(),
                any<RowMapper<PostTagIndexRepositoryPort.LockedPostSource>>(),
                eq(11L),
            ),
        ).thenReturn(emptyList())
        val repository = PostTagIndexJdbcRepository(jdbcTemplate)

        repository.replacePostTags(11L, emptyList())

        assertThatThrownBy { repository.replacePostTags(11L, listOf("unexpected")) }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("missing postId=11")
        verify(jdbcTemplate, times(2)).query(
            anyString(),
            any<RowMapper<PostTagIndexRepositoryPort.LockedPostSource>>(),
            eq(11L),
        )
    }
}
