package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import jakarta.persistence.EntityManager
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
            ).setParameter("subjects", subjects)
            .setParameter("names", names)
            .resultList
    }

    override fun incrementIntValue(
        subject: Post,
        name: String,
        delta: Int,
    ): Int =
        (
            entityManager
                .createNativeQuery(
                    """
                    insert into post_attr (id, subject_id, name, int_value)
                    values (nextval('post_attr_seq'), :subjectId, :name, greatest(:delta, 0))
                    on conflict (subject_id, name)
                    do update set int_value = greatest(0, coalesce(post_attr.int_value, 0) + :delta)
                    returning int_value
                    """.trimIndent(),
                ).setParameter("subjectId", subject.id)
                .setParameter("name", name)
                .setParameter("delta", delta)
                .singleResult as Number
        ).toInt()

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
