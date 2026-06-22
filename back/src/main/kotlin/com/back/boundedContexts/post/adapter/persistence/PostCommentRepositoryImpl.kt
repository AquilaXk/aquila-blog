package com.back.boundedContexts.post.adapter.persistence

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

        if (ids.isEmpty()) return emptyList()

        val comments =
            entityManager
                .createQuery(
                    """
                    select c
                    from PostComment c
                    join fetch c.author
                    left join fetch c.parentComment
                    where c.post = :post
                      and c.id in :ids
                    """.trimIndent(),
                    PostComment::class.java,
                ).setParameter("post", post)
                .setParameter("ids", ids)
                .resultList
                .associateBy(PostComment::id)

        return ids.mapNotNull(comments::get)
    }

    override fun softDeleteByAuthorId(authorId: Long): Int {
        val affectedPostIds =
            entityManager
                .createNativeQuery(
                    """
                    select distinct post_id
                    from post_comment
                    where author_id = :authorId
                      and deleted_at is null
                    """.trimIndent(),
                ).setParameter("authorId", authorId)
                .resultList
                .map { (it as Number).toLong() }

        if (affectedPostIds.isEmpty()) return 0

        val commentIdsToDelete =
            entityManager
                .createNativeQuery(
                    """
                    with recursive comment_tree as (
                        select pc.id, pc.created_at, 0 as depth
                        from post_comment pc
                        where pc.author_id = :authorId
                          and pc.deleted_at is null
                        union all
                        select child.id, child.created_at, comment_tree.depth + 1
                        from post_comment child
                        join comment_tree on child.parent_comment_id = comment_tree.id
                        where child.deleted_at is null
                    )
                    select distinct id
                    from comment_tree
                    order by id asc
                    """.trimIndent(),
                ).setParameter("authorId", authorId)
                .resultList
                .map { (it as Number).toLong() }

        if (commentIdsToDelete.isEmpty()) return 0

        val deletedRows =
            entityManager
                .createNativeQuery(
                    """
                    update post_comment
                    set deleted_at = now(),
                        modified_at = now()
                    where id in (:commentIds)
                      and deleted_at is null
                    """.trimIndent(),
                ).setParameter("commentIds", commentIdsToDelete)
                .executeUpdate()

        entityManager
            .createNativeQuery(
                """
                update post_attr pa
                set int_value = counts.active_count,
                    modified_at = now()
                from (
                    select p.id as post_id, count(pc.id)::int as active_count
                    from post p
                    left join post_comment pc on pc.post_id = p.id and pc.deleted_at is null
                    where p.id in (:postIds)
                    group by p.id
                ) counts
                where pa.subject_id = counts.post_id
                  and pa.name = :commentsCountName
                """.trimIndent(),
            ).setParameter("postIds", affectedPostIds)
            .setParameter("commentsCountName", COMMENTS_COUNT)
            .executeUpdate()

        return deletedRows
    }
}
