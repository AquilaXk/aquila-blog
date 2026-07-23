package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext
import jakarta.persistence.PersistenceException
import org.hibernate.Session
import java.time.Instant

/**
 * PostAttrRepositoryImpl는 영속 계층(JPA/쿼리) 연동을 담당하는 퍼시스턴스 어댑터입니다.
 * 도메인 요구사항에 맞는 조회/저장 연산을 DB 구현으로 매핑합니다.
 */
class PostAttrRepositoryImpl : PostAttrRepositoryCustom {
    @field:PersistenceContext
    private lateinit var entityManager: EntityManager

    override fun findBySubjectAndName(
        subject: Post,
        name: String,
    ): PostAttr? =
        entityManager
            .unwrap(Session::class.java)
            .byNaturalId(PostAttr::class.java)
            .using(PostAttr::subject.name, subject)
            .using(PostAttr::name.name, name)
            .load()

    override fun findBySubjectInAndNameIn(
        subjects: List<Post>,
        names: List<String>,
    ): List<PostAttr> {
        if (subjects.isEmpty() || names.isEmpty()) return emptyList()

        return entityManager
            .createQuery(
                """
                select a
                from PostAttr a
                where a.subject in :subjects
                  and a.name in :names
                """.trimIndent(),
                PostAttr::class.java,
            ).setParameter("subjects", subjects)
            .setParameter("names", names)
            .resultList
    }

    override fun incrementIntValue(
        subject: Post,
        name: String,
        delta: Int,
    ): Int {
        val updatedValues = updateIntValue(subject.id, name, delta)
        if (updatedValues.isNotEmpty()) return updatedValues.max()

        try {
            return (
                entityManager
                    .createNativeQuery(
                        """
                        insert into post_attr (id, subject_id, name, int_value)
                        values (
                          nextval(
                            coalesce(
                              pg_get_serial_sequence('post_attr', 'id'),
                              'public.post_attr_seq'
                            )::regclass
                          ),
                          :subjectId,
                          :name,
                          greatest(:delta, 0)
                        )
                        returning int_value
                        """.trimIndent(),
                    ).setParameter("subjectId", subject.id)
                    .setParameter("name", name)
                    .setParameter("delta", delta)
                    .singleResult as Number
            ).toInt()
        } catch (exception: PersistenceException) {
            // 동시 insert 경쟁으로 이미 생성된 경우 update 경로로 재시도한다.
            val retriedValues = updateIntValue(subject.id, name, delta)
            if (retriedValues.isNotEmpty()) return retriedValues.max()
            throw exception
        }
    }

    /**
     * IntValue 항목을 수정한다.
     */
    private fun updateIntValue(
        subjectId: Long,
        name: String,
        delta: Int,
    ): List<Int> =
        entityManager
            .createNativeQuery(
                """
                update post_attr
                set int_value = greatest(0, coalesce(int_value, 0) + :delta)
                where subject_id = :subjectId
                  and name = :name
                returning int_value
                """.trimIndent(),
            ).setParameter("subjectId", subjectId)
            .setParameter("name", name)
            .setParameter("delta", delta)
            .resultList
            .map { (it as Number).toInt() }

    override fun findRecentlyModifiedByName(
        name: String,
        modifiedAfter: Instant,
        limit: Int,
    ): List<PostAttr> =
        entityManager
            .createQuery(
                """
                select a
                from PostAttr a
                where a.name = :name
                  and a.modifiedAt >= :modifiedAfter
                order by a.modifiedAt desc
                """.trimIndent(),
                PostAttr::class.java,
            ).setParameter("name", name)
            .setParameter("modifiedAfter", modifiedAfter)
            .setMaxResults(limit)
            .resultList
}
