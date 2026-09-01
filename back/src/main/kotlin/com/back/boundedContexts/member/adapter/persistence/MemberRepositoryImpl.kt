package com.back.boundedContexts.member.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext
import org.hibernate.Session

/**
 * MemberRepositoryImpl는 영속 계층(JPA/쿼리) 연동을 담당하는 퍼시스턴스 어댑터입니다.
 * 도메인 요구사항에 맞는 조회/저장 연산을 DB 구현으로 매핑합니다.
 */
class MemberRepositoryImpl : MemberRepositoryCustom {
    @PersistenceContext
    private lateinit var entityManager: EntityManager

    override fun findByLoginId(loginId: String): Member? =
        entityManager
            .unwrap(Session::class.java)
            .byNaturalId(Member::class.java)
            .using("username", loginId)
            .load()
}
