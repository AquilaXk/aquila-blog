package com.back.boundedContexts.post.adapter.persistence

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyInt
import org.mockito.ArgumentMatchers.anyList
import org.mockito.ArgumentMatchers.anyString
import org.mockito.ArgumentMatchers.eq
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.ParameterizedPreparedStatementSetter
import org.springframework.jdbc.core.RowMapper

@DisplayName("PostImageReferenceJdbcRepository 테스트")
class PostImageReferenceJdbcRepositoryTest {
    private val jdbcTemplate = mock(JdbcTemplate::class.java)
    private val repository = PostImageReferenceJdbcRepository(jdbcTemplate)

    @Test
    fun `existsByPostIdAndObjectKey - 올바른 인자 전달 시 쿼리 결과를 반환한다`() {
        `when`(
            jdbcTemplate.queryForObject(
                anyString(),
                eq(Long::class.java),
                eq(10L),
                eq("posts/test.png"),
            ),
        ).thenReturn(1L)

        val exists = repository.existsByPostIdAndObjectKey(10L, "posts/test.png")
        assertThat(exists).isTrue()

        val notExists = repository.existsByPostIdAndObjectKey(-1L, "posts/test.png")
        assertThat(notExists).isFalse()

        val blankKey = repository.existsByPostIdAndObjectKey(10L, "")
        assertThat(blankKey).isFalse()
    }

    @Test
    fun `existsByObjectKey - 올바른 인자 전달 시 쿼리 결과를 반환한다`() {
        `when`(
            jdbcTemplate.queryForObject(
                anyString(),
                eq(Long::class.java),
                eq("posts/test.png"),
            ),
        ).thenReturn(1L)

        val exists = repository.existsByObjectKey("posts/test.png")
        assertThat(exists).isTrue()

        val blankKey = repository.existsByObjectKey("   ")
        assertThat(blankKey).isFalse()
    }

    @Test
    fun `replacePostImageReferences - 기존 키 삭제 후 신규 키를 batchUpdate 한다`() {
        repository.replacePostImageReferences(10L, listOf("posts/1.png", "posts/2.png", "  posts/1.png  ", ""))

        verify(jdbcTemplate, times(1)).update(anyString(), eq(10L))
        verify(jdbcTemplate, times(1)).batchUpdate(
            anyString(),
            eq(listOf("posts/1.png", "posts/2.png")),
            eq(2),
            any<ParameterizedPreparedStatementSetter<String>>(),
        )
    }

    @Test
    fun `replacePostImageReferences - 빈 키 목록인 경우 DELETE만 수행한다`() {
        repository.replacePostImageReferences(10L, emptyList())

        verify(jdbcTemplate, times(1)).update(anyString(), eq(10L))
        verify(jdbcTemplate, never()).batchUpdate(
            anyString(),
            anyList(),
            anyInt(),
            any<ParameterizedPreparedStatementSetter<String>>(),
        )
    }

    @Test
    fun `deletePostImageReferences - post_id 기준 삭제를 수행한다`() {
        repository.deletePostImageReferences(10L)
        verify(jdbcTemplate, times(1)).update(anyString(), eq(10L))

        repository.deletePostImageReferences(0L)
        verify(jdbcTemplate, times(1)).update(anyString(), eq(10L))
    }

    @Test
    fun `findObjectKeysByPostId - 키 목록을 조회한다`() {
        `when`(
            jdbcTemplate.query(
                anyString(),
                any<RowMapper<String>>(),
                eq(10L),
            ),
        ).thenReturn(listOf("posts/1.png", "posts/2.png"))

        val keys = repository.findObjectKeysByPostId(10L)
        assertThat(keys).containsExactly("posts/1.png", "posts/2.png")

        val emptyKeys = repository.findObjectKeysByPostId(-1L)
        assertThat(emptyKeys).isEmpty()
    }
}
