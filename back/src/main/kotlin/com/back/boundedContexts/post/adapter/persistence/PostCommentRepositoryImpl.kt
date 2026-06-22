package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.post.application.port.output.PostCommentAccountDeletionTarget
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment
import com.back.boundedContexts.post.domain.postMixin.COMMENTS_COUNT
import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext

/**
 * PostCommentRepositoryImpl는 영속 계층(JPA/쿼리) 연동을 담당하는 퍼시스턴스 어댑터입니다.
 * 도메인 요구사항에 맞는 조회/저장 연산을 DB 구현으로 매핑합니다.
 */
class PostCommentRepositoryImpl : PostCommentRepositoryCustom {
    @field:PersistenceContext
    private lateinit var entityManager: EntityManager

    override fun findActiveSubtreeByPostAndRootCommentId(
        post: Post,
        rootCommentId: Long,
    ): List<PostComment> {
        val ids =
            entityManager
                .createNativeQuery(
                    """
                    with recursive comment_tree as (
                        select pc.id, pc.created_at, 0 as depth
                        from post_comment pc
                        where pc.post_id = :postId
                          and pc.id = :rootCommentId
                          and pc.deleted_at is null
                        union all
                        select child.id, child.created_at, comment_tree.depth + 1
                        from post_comment child
                        join comment_tree on child.parent_comment_id = comment_tree.id
                        where child.post_id = :postId
                          and child.deleted_at is null
                    )
                    select id
                    from comment_tree
                    order by depth desc, created_at asc, id asc
                    """.trimIndent(),
                ).setParameter("postId", post.id)
                .setParameter("rootCommentId", rootCommentId)
                .resultList
                .map { (it as Number).toLong() }

        return findActiveCommentsByIdsInOrder(ids)
    }

    override fun findActiveSubtreeByPostIdAndRootCommentId(
        postId: Long,
        rootCommentId: Long,
    ): List<PostComment> {
        val ids =
            entityManager
                .createNativeQuery(
                    """
                    with recursive comment_tree as (
                        select pc.id, pc.created_at, 0 as depth
                        from post_comment pc
                        where pc.post_id = :postId
                          and pc.id = :rootCommentId
                          and pc.deleted_at is null
                        union all
                        select child.id, child.created_at, comment_tree.depth + 1
                        from post_comment child
                        join comment_tree on child.parent_comment_id = comment_tree.id
                        where child.post_id = :postId
                          and child.deleted_at is null
                    )
                    select id
                    from comment_tree
                    order by depth desc, created_at asc, id asc
                    """.trimIndent(),
                ).setParameter("postId", postId)
                .setParameter("rootCommentId", rootCommentId)
                .resultList
                .map { (it as Number).toLong() }

        return findActiveCommentsByIdsInOrder(ids)
    }

    override fun findActiveAccountDeletionTargetsByAuthorId(authorId: Long): List<PostCommentAccountDeletionTarget> {
        val rows =
            entityManager
                .createNativeQuery(
                    """
                    select pc.id, pc.post_id, case when p.deleted_at is null then false else true end
                    from post_comment pc
                    join post p on p.id = pc.post_id
                    where pc.author_id = :authorId
                      and pc.deleted_at is null
                    order by pc.post_id asc, pc.created_at asc, pc.id asc
                    """.trimIndent(),
                ).setParameter("authorId", authorId)
                .resultList
                .map { row ->
                    val columns = row as Array<*>
                    AccountDeletionTargetRow(
                        commentId = (columns[0] as Number).toLong(),
                        postId = (columns[1] as Number).toLong(),
                        postDeleted = columns[2] as Boolean,
                    )
                }

        val commentsById = findActiveCommentsByIdsInOrder(rows.map(AccountDeletionTargetRow::commentId)).associateBy(PostComment::id)

        return rows.map { row ->
            PostCommentAccountDeletionTargetResult(
                comment = commentsById.getValue(row.commentId),
                postId = row.postId,
                postDeleted = row.postDeleted,
            )
        }
    }

    override fun decrementPostCommentsCountByPostId(
        postId: Long,
        count: Int,
    ): Int =
        (
            entityManager
                .createNativeQuery(
                    """
                    update post_attr
                    set int_value = greatest(0, coalesce(int_value, 0) - :count)
                    where subject_id = :postId
                      and name = :name
                    returning int_value
                    """.trimIndent(),
                ).setParameter("postId", postId)
                .setParameter("name", COMMENTS_COUNT)
                .setParameter("count", count)
                .singleResult as Number
        ).toInt()

    private fun findActiveCommentsByIdsInOrder(ids: List<Long>): List<PostComment> {
        if (ids.isEmpty()) return emptyList()

        val comments =
            entityManager
                .createQuery(
                    """
                    select c
                    from PostComment c
                    join fetch c.author
                    left join fetch c.parentComment
                    where c.id in :ids
                    """.trimIndent(),
                    PostComment::class.java,
                ).setParameter("ids", ids)
                .resultList
                .associateBy(PostComment::id)

        return ids.mapNotNull(comments::get)
    }

    private data class AccountDeletionTargetRow(
        val commentId: Long,
        val postId: Long,
        val postDeleted: Boolean,
    )

    private data class PostCommentAccountDeletionTargetResult(
        override val comment: PostComment,
        override val postId: Long,
        override val postDeleted: Boolean,
    ) : PostCommentAccountDeletionTarget
}
