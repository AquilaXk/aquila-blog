package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import jakarta.persistence.EntityManager
import jakarta.persistence.FlushModeType
import jakarta.persistence.PersistenceContext
import org.hibernate.Session
import java.time.Instant

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
            ).setFlushMode(FlushModeType.COMMIT)
            .setParameter("subjects", subjects)
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

        return (
            entityManager
                .createNativeQuery(
                    """
                    insert into post_attr (id, subject_id, name, int_value, created_at, modified_at)
                    values (
                      nextval(
                        coalesce(
                          pg_get_serial_sequence('post_attr', 'id'),
                          'public.post_attr_seq'
                        )::regclass
                      ),
                      :subjectId,
                      :name,
                      greatest(:delta, 0),
                      CURRENT_TIMESTAMP,
                      CURRENT_TIMESTAMP
                    )
                    on conflict (subject_id, name) do update
                    set int_value = greatest(0, coalesce(post_attr.int_value, 0) + :delta),
                        modified_at = CURRENT_TIMESTAMP
                    returning int_value
                    """.trimIndent(),
                ).setParameter("subjectId", subject.id)
                .setParameter("name", name)
                .setParameter("delta", delta)
                .singleResult as Number
        ).toInt()
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
                set int_value = greatest(0, coalesce(int_value, 0) + :delta),
                    modified_at = now()
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
                join fetch a.subject
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
