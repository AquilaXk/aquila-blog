package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext
import jakarta.persistence.PersistenceException

/**
 * PostLikeRepositoryImpl는 영속 계층(JPA/쿼리) 연동을 담당하는 퍼시스턴스 어댑터입니다.
 * 도메인 요구사항에 맞는 조회/저장 연산을 DB 구현으로 매핑합니다.
 */
class PostLikeRepositoryImpl : PostLikeRepositoryCustom {
    @field:PersistenceContext
    private lateinit var entityManager: EntityManager

    override fun insertIfAbsent(
        liker: Member,
        post: Post,
    ): Long? {
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
