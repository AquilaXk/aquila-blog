package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.postMixin.PostLikeToggleResult
import com.back.boundedContexts.post.model.Post
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.dao.DataIntegrityViolationException
import java.sql.SQLException

@DisplayName("PostLikeConflictResolver 테스트")
class PostLikeConflictResolverTest {
    private val resolver = PostLikeConflictResolver()
    private val actor = Member(1L, "user1", null, "user1", "user1@test.com")
    private val post = Post(1L, actor, "title", "content", published = true, listed = true)

    @Test
    @DisplayName("recoverable DB 충돌이면 reconcile 결과를 반환한다")
    fun recoverRecoverableDatabaseConflictWithReconcile() {
        // given
        var reconcileCalls = 0
        val expected = PostLikeToggleResult(isLiked = true, likeId = 10L)

        // when
        val result =
            resolver.resolve(
                post = post,
                actor = actor,
                action = { throw DataIntegrityViolationException("duplicate like", SQLException("duplicate", "23505")) },
                reconcile = {
                    reconcileCalls += 1
                    expected
                },
                snapshot = { PostLikeToggleResult(isLiked = false, likeId = 0L) },
            )

        // then
        assertThat(result).isEqualTo(expected)
        assertThat(reconcileCalls).isEqualTo(1)
    }

    @Test
    @DisplayName("reconcile도 실패하면 snapshot 결과를 반환한다")
    fun fallbackToSnapshotWhenReconcileFails() {
        // given
        var snapshotCalls = 0
        val expected = PostLikeToggleResult(isLiked = false, likeId = 0L)

        // when
        val result =
            resolver.resolve(
                post = post,
                actor = actor,
                action = { throw DataIntegrityViolationException("deadlock", SQLException("deadlock", "40P01")) },
                reconcile = { throw IllegalStateException("reconcile failed") },
                snapshot = {
                    snapshotCalls += 1
                    expected
                },
            )

        // then
        assertThat(result).isEqualTo(expected)
        assertThat(snapshotCalls).isEqualTo(1)
    }

    @Test
    @DisplayName("recoverable 충돌이 아니면 예외를 그대로 전파한다")
    fun throwNonRecoverableException() {
        // given
        val exception = IllegalArgumentException("invalid like request")

        // when & then
        assertThatThrownBy {
            resolver.resolve(
                post = post,
                actor = actor,
                action = { throw exception },
                reconcile = { PostLikeToggleResult(isLiked = true, likeId = 1L) },
                snapshot = { PostLikeToggleResult(isLiked = false, likeId = 0L) },
            )
        }.isSameAs(exception)
    }
}
