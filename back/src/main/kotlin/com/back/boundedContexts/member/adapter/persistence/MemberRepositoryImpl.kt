package com.back.boundedContexts.member.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.model.shared.QMember.member
import com.back.standard.util.QueryDslUtil
import com.querydsl.core.BooleanBuilder
import com.querydsl.core.types.dsl.Expressions
import com.querydsl.jpa.impl.JPAQuery
import com.querydsl.jpa.impl.JPAQueryFactory
import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext
import org.hibernate.Session
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.support.PageableExecutionUtils

/**
 * MemberRepositoryImpl는 영속 계층(JPA/쿼리) 연동을 담당하는 퍼시스턴스 어댑터입니다.
 * 도메인 요구사항에 맞는 조회/저장 연산을 DB 구현으로 매핑합니다.
 */
class MemberRepositoryImpl(
    private val queryFactory: JPAQueryFactory,
) : MemberRepositoryCustom {
    @PersistenceContext
    private lateinit var entityManager: EntityManager

    override fun findByLoginId(loginId: String): Member? =
        entityManager
            .unwrap(Session::class.java)
            .byNaturalId(Member::class.java)
            .using("username", loginId)
            .load()

    override fun findQPagedByKw(
        kw: String,
        pageable: Pageable,
    ): Page<Member> {
        val builder = BooleanBuilder()
        val normalizedKw = kw.trim()

        if (normalizedKw.isNotEmpty()) {
            builder.and(
                Expressions.booleanTemplate(
                    "function('pgroonga_match', {0}, {1}, {2}) = true",
                    member.username,
                    member.nickname,
                    Expressions.constant(normalizedKw),
                ),
            )
        }

        val itemsQuery = createItemsQuery(builder, pageable)
        val countQuery = createCountQuery(builder)

        return PageableExecutionUtils.getPage(itemsQuery.fetch(), pageable) { countQuery.fetchOne() ?: 0L }
    }

    /**
     * ItemsQuery 항목을 생성한다.
     */
    private fun createItemsQuery(
        builder: BooleanBuilder,
        pageable: Pageable,
    ): JPAQuery<Member> {
        val query =
            queryFactory
                .selectFrom(member)
                .where(builder)

        QueryDslUtil.applySorting(query, pageable) { property ->
            when (property) {
                "createdAt" -> member.createdAt
                "username", "loginId" -> member.username
                "nickname" -> member.nickname
                else -> null
            }
        }

        if (pageable.sort.isEmpty) {
            query.orderBy(member.id.desc())
        }

        return query
            .offset(pageable.offset)
            .limit(pageable.pageSize.toLong())
    }

    /**
     * CountQuery 항목을 생성한다.
     */
    private fun createCountQuery(builder: BooleanBuilder): JPAQuery<Long> =
        queryFactory
            .select(member.count())
            .from(member)
            .where(builder)
}
