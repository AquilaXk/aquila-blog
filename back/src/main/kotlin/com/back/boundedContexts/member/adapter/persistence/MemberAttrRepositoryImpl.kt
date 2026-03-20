package com.back.boundedContexts.member.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext
import jakarta.persistence.PersistenceException
import org.hibernate.Session
import org.springframework.dao.DataIntegrityViolationException

/**
 * MemberAttrRepositoryImpl는 영속 계층(JPA/쿼리) 연동을 담당하는 퍼시스턴스 어댑터입니다.
 * 도메인 요구사항에 맞는 조회/저장 연산을 DB 구현으로 매핑합니다.
 */
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

        try {
            return (
                entityManager
                    .createNativeQuery(
                        """
                        insert into member_attr (id, subject_id, name, int_value)
                        values (
                          nextval(
                            coalesce(
                              pg_get_serial_sequence('member_attr', 'id'),
                              'public.member_attr_seq'
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
        } catch (exception: DataIntegrityViolationException) {
            // 스프링 예외 변환 계층에서 감싼 중복키 예외도 동일하게 재시도한다.
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
                update member_attr
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
}
