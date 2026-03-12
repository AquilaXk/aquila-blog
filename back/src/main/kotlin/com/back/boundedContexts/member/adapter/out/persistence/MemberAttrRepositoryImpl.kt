package com.back.boundedContexts.member.adapter.out.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext
import org.hibernate.Session

class MemberAttrRepositoryImpl : MemberAttrRepositoryCustom {
    @field:PersistenceContext
    private lateinit var entityManager: EntityManager

    override fun findBySubjectAndName(
        subject: Member,
        name: String,
    ): MemberAttr? =
        entityManager
            .unwrap(Session::class.java)
            .byNaturalId(MemberAttr::class.java)
            .using(MemberAttr::subject.name, subject)
            .using(MemberAttr::name.name, name)
            .load()

    override fun findBySubjectInAndNameIn(
        subjects: List<Member>,
        names: List<String>,
    ): List<MemberAttr> {
        if (subjects.isEmpty() || names.isEmpty()) return emptyList()

        return entityManager
            .createQuery(
                """
                select a
                from MemberAttr a
                where a.subject in :subjects
                  and a.name in :names
                """.trimIndent(),
                MemberAttr::class.java,
            ).setParameter("subjects", subjects)
            .setParameter("names", names)
            .resultList
    }

    override fun existsByNameAndStrValue(
        name: String,
        strValue: String,
    ): Boolean =
        entityManager
            .createQuery(
                """
                select count(a) > 0
                from MemberAttr a
                where a.name = :name
                  and a.strValue = :strValue
                """.trimIndent(),
                java.lang.Boolean::class.java,
            ).setParameter("name", name)
            .setParameter("strValue", strValue)
            .singleResult == true
}
