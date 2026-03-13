package com.back.boundedContexts.post.adapter.out.persistence

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostComment
import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext

class PostCommentRepositoryImpl : PostCommentRepositoryCustom {
    @field:PersistenceContext
    private lateinit var entityManager: EntityManager

    override fun findActiveSubtreeByPostAndRootCommentId(
        post: Post,
        rootCommentId: Int,
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
                .map { (it as Number).toInt() }

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
}
