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
    ): Long? {
        findExistingLikeId(liker.id, post.id)?.let { return null }

        val result =
            entityManager
                .createNativeQuery(
                    """
                    insert into post_like (id, liker_id, post_id, created_at, modified_at)
                    values (
                      nextval(
                        coalesce(
                          pg_get_serial_sequence('post_like', 'id'),
                          'public.post_like_seq'
                        )::regclass
                      ),
                      :likerId,
                      :postId,
                      CURRENT_TIMESTAMP,
                      CURRENT_TIMESTAMP
                    )
                    on conflict (liker_id, post_id) do nothing
                    returning id
                    """.trimIndent(),
                ).setParameter("likerId", liker.id)
                .setParameter("postId", post.id)
                .resultList
                .firstOrNull()

        return (result as? Number)?.toLong()
    }

    private fun findExistingLikeId(
        likerId: Long,
        postId: Long,
    ): Long? =
        entityManager
            .createNativeQuery(
                """
                select id
                from post_like
                where liker_id = :likerId
                  and post_id = :postId
                order by id asc
                limit 1
                """.trimIndent(),
            ).setParameter("likerId", likerId)
            .setParameter("postId", postId)
            .resultList
            .firstOrNull()
            ?.let { (it as Number).toLong() }
}
