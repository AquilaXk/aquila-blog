package com.back.boundedContexts.member.adapter.persistence

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

    override fun existsByNameAndStrValueContaining(
        name: String,
        valueFragment: String,
    ): Boolean =
        entityManager
            .createQuery(
                """
                select count(a) > 0
                from MemberAttr a
                where a.name = :name
                  and a.strValue like :pattern
                """.trimIndent(),
                java.lang.Boolean::class.java,
            ).setParameter("name", name)
            .setParameter("pattern", "%$valueFragment%")
            .singleResult == true

    override fun existsBySubjectIdAndNameAndStrValueContaining(
        subjectId: Long,
        name: String,
        valueFragment: String,
    ): Boolean =
        entityManager
            .createQuery(
                """
                select count(a) > 0
                from MemberAttr a
                where a.subject.id = :subjectId
                  and a.name = :name
                  and a.strValue like :pattern
                """.trimIndent(),
                java.lang.Boolean::class.java,
            ).setParameter("subjectId", subjectId)
            .setParameter("name", name)
            .setParameter("pattern", "%$valueFragment%")
            .singleResult == true

    override fun incrementIntValue(
        subject: Member,
        name: String,
        delta: Int,
    ): Int {
        val updatedValues = updateIntValue(subject.id, name, delta)
        if (updatedValues.isNotEmpty()) return updatedValues.max()

        return (
            entityManager
                .createNativeQuery(
                    """
                    insert into member_attr (id, subject_id, name, int_value, created_at, modified_at)
                    values (
                      nextval(
                        coalesce(
                          pg_get_serial_sequence('member_attr', 'id'),
                          'public.member_attr_seq'
                        )::regclass
                      ),
                      :subjectId,
                      :name,
                      greatest(:delta, 0),
                      CURRENT_TIMESTAMP,
                      CURRENT_TIMESTAMP
                    )
                    on conflict (subject_id, name) do update
                    set int_value = greatest(0, coalesce(member_attr.int_value, 0) + :delta),
                        modified_at = CURRENT_TIMESTAMP
                    returning int_value
                    """.trimIndent(),
                ).setParameter("subjectId", subject.id)
                .setParameter("name", name)
                .setParameter("delta", delta)
                .singleResult as Number
        ).toInt()
    }

    override fun clearStringValuesBySubjectIdAndNameIn(
        subjectId: Long,
        names: Collection<String>,
    ): Int {
        if (names.isEmpty()) return 0

        return entityManager
            .createQuery(
                """
                update MemberAttr a
                set a.strValue = ''
                where a.subject.id = :subjectId
                  and a.name in :names
                """.trimIndent(),
            ).setParameter("subjectId", subjectId)
            .setParameter("names", names)
            .executeUpdate()
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
                update member_attr
                set int_value = greatest(0, coalesce(int_value, 0) + :delta),
                    modified_at = CURRENT_TIMESTAMP
                where subject_id = :subjectId
                  and name = :name
                returning int_value
                """.trimIndent(),
            ).setParameter("subjectId", subjectId)
            .setParameter("name", name)
            .setParameter("delta", delta)
            .resultList
            .map { (it as Number).toInt() }
}
