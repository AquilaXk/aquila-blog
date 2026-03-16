package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext
import jakarta.persistence.PersistenceException

class PostLikeRepositoryImpl : PostLikeRepositoryCustom {
    @field:PersistenceContext
    private lateinit var entityManager: EntityManager

    override fun insertIfAbsent(
        liker: Member,
        post: Post,
    ): Int? {
        findExistingLikeId(liker.id, post.id)?.let { return null }

        val result =
            try {
                entityManager
                    .createNativeQuery(
                        """
                        insert into post_like (id, liker_id, post_id)
                        values (
                          nextval(
                            coalesce(
                              pg_get_serial_sequence('post_like', 'id'),
                              'public.post_like_seq'
                            )::regclass
                          ),
                          :likerId,
                          :postId
                        )
                        returning id
                        """.trimIndent(),
                    ).setParameter("likerId", liker.id)
                    .setParameter("postId", post.id)
                    .resultList
                    .firstOrNull()
            } catch (exception: PersistenceException) {
                // 동시 insert 경쟁이면 기존 row를 사용하므로 null 반환으로 처리한다.
                if (findExistingLikeId(liker.id, post.id) != null) return null
                throw exception
            }

        return (result as? Number)?.toInt()
    }

    private fun findExistingLikeId(
        likerId: Int,
        postId: Int,
    ): Int? =
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
            ?.let { (it as Number).toInt() }
}
