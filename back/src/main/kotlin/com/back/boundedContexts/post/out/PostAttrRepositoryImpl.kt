package com.back.boundedContexts.post.out

import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext
import org.hibernate.Session

class PostAttrRepositoryImpl : PostAttrRepositoryCustom {
    @field:PersistenceContext
    private lateinit var entityManager: EntityManager

    override fun findBySubjectAndName(subject: Post, name: String): PostAttr? =
        entityManager.unwrap(Session::class.java)
            .byNaturalId(PostAttr::class.java)
            .using(PostAttr::subject.name, subject)
            .using(PostAttr::name.name, name)
            .load()

    override fun findBySubjectInAndNameIn(subjects: List<Post>, names: List<String>): List<PostAttr> {
        if (subjects.isEmpty() || names.isEmpty()) return emptyList()

        return entityManager.createQuery(
            """
            select a
            from PostAttr a
            where a.subject in :subjects
              and a.name in :names
            """.trimIndent(),
            PostAttr::class.java,
        )
            .setParameter("subjects", subjects)
            .setParameter("names", names)
            .resultList
    }
}
