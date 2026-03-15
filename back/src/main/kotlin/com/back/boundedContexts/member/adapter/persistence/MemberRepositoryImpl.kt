package com.back.boundedContexts.member.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.QMember.member
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

class MemberRepositoryImpl(
    private val queryFactory: JPAQueryFactory,
) : MemberRepositoryCustom {
    @PersistenceContext
    private lateinit var entityManager: EntityManager

    override fun findByUsername(username: String): Member? =
        entityManager
            .unwrap(Session::class.java)
            .byNaturalId(Member::class.java)
            .using("username", username)
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
                "username" -> member.username
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

    private fun createCountQuery(builder: BooleanBuilder): JPAQuery<Long> =
        queryFactory
            .select(member.count())
            .from(member)
            .where(builder)
}
