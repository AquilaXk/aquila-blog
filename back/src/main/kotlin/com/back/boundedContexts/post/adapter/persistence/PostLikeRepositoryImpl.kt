package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext

class PostLikeRepositoryImpl : PostLikeRepositoryCustom {
    @field:PersistenceContext
    private lateinit var entityManager: EntityManager

    override fun insertIfAbsent(
        liker: Member,
        post: Post,
    ): Int? {
        val result =
            entityManager
                .createNativeQuery(
                    """
                    insert into post_like (id, liker_id, post_id)
                    values (nextval('post_like_seq'), :likerId, :postId)
                    on conflict (liker_id, post_id) do nothing
                    returning id
                    """.trimIndent(),
                ).setParameter("likerId", liker.id)
                .setParameter("postId", post.id)
                .resultList
                .firstOrNull()

        return (result as? Number)?.toInt()
    }
}
