package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.postMixin.META_TAGS_INDEX
import com.back.boundedContexts.post.model.QPost.post
import com.back.boundedContexts.post.model.QPostAttr.postAttr
import com.back.standard.util.QueryDslUtil
import com.querydsl.core.BooleanBuilder
import com.querydsl.core.types.dsl.BooleanExpression
import com.querydsl.core.types.dsl.Expressions
import com.querydsl.jpa.JPAExpressions
import com.querydsl.jpa.impl.JPAQuery
import com.querydsl.jpa.impl.JPAQueryFactory
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.support.PageableExecutionUtils

/**
 * PostRepositoryImpl는 영속 계층(JPA/쿼리) 연동을 담당하는 퍼시스턴스 어댑터입니다.
 * 도메인 요구사항에 맞는 조회/저장 연산을 DB 구현으로 매핑합니다.
 */
class PostRepositoryImpl(
    private val queryFactory: JPAQueryFactory,
) : PostRepositoryCustom {
    override fun findQPagedByKw(
        kw: String,
        pageable: Pageable,
    ): Page<Post> = findPosts(null, kw, pageable, publicOnly = true)

    override fun findQPagedByKwForAdmin(
        kw: String,
        pageable: Pageable,
    ): Page<Post> = findPosts(null, kw, pageable, publicOnly = false)

    override fun findQPagedByAuthorAndKw(
        author: Member,
        kw: String,
        pageable: Pageable,
    ): Page<Post> = findPosts(author, kw, pageable, publicOnly = false)

    override fun findQPagedByKwAndTag(
        kw: String,
        tag: String,
        pageable: Pageable,
    ): Page<Post> = findPosts(null, kw, pageable, publicOnly = true, tag = tag)

    override fun findAllPublicListedContents(): List<String> =
        queryFactory
            .select(post.content)
            .from(post)
            .where(post.published.isTrue.and(post.listed.isTrue))
            .fetch()

    override fun findAllPublicListedTagIndexes(tagIndexAttrName: String): List<String> =
        queryFactory
            .select(postAttr.strValue)
            .from(postAttr)
            .join(postAttr.subject, post)
            .where(
                post.published
                    .isTrue
                    .and(post.listed.isTrue)
                    .and(postAttr.name.eq(tagIndexAttrName))
                    .and(postAttr.strValue.isNotNull),
            ).fetch()
            .filterNotNull()

    private fun findPosts(
        author: Member?,
        kw: String,
        pageable: Pageable,
        publicOnly: Boolean = false,
        tag: String? = null,
    ): Page<Post> {
        val builder = BooleanBuilder()

        if (publicOnly) {
            builder.and(post.published.isTrue)
            builder.and(post.listed.isTrue)
        }
        author?.let { builder.and(post.author.eq(it)) }
        if (kw.isNotBlank()) builder.and(buildKwPredicate(kw))
        if (!tag.isNullOrBlank()) builder.and(buildTagPredicate(tag))

        val postsQuery = createPostsQuery(builder, pageable)
        // count는 join/fetchJoin 없이 별도 쿼리로 계산해 페이지네이션 비용을 낮춘다.
        val countQuery = createCountQuery(builder)

        return PageableExecutionUtils.getPage(
            postsQuery.fetch(),
            pageable,
        ) { countQuery.fetchOne() ?: 0L }
    }

    private fun buildKwPredicate(kw: String): BooleanExpression =
        Expressions.booleanTemplate(
            "function('pgroonga_post_match', {0}, {1}, {2}) = true",
            post.title,
            post.content,
            Expressions.constant(kw),
        )

    private fun buildTagPredicate(tag: String): BooleanExpression {
        val normalizedTag = normalizeTagToken(tag)
        if (normalizedTag.isBlank()) return Expressions.booleanTemplate("1 = 0")

        val indexToken = "%|${escapeLikeToken(normalizedTag)}|%"
        return JPAExpressions
            .selectOne()
            .from(postAttr)
            .where(
                postAttr.subject
                    .eq(post)
                    .and(postAttr.name.eq(META_TAGS_INDEX))
                    .and(
                        Expressions.booleanTemplate(
                            "lower({0}) like {1} escape '\\\\'",
                            postAttr.strValue,
                            Expressions.constant(indexToken),
                        ),
                    ),
            ).exists()
    }

    private fun normalizeTagToken(tag: String): String = tag.trim().lowercase()

    private fun escapeLikeToken(token: String): String =
        token
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")

    /**
     * PostsQuery 항목을 생성한다.
     */
    private fun createPostsQuery(
        builder: BooleanBuilder,
        pageable: Pageable,
    ): JPAQuery<Post> {
        val query =
            queryFactory
                .selectFrom(post)
                // 목록 DTO에서 author 접근이 필수라 fetchJoin으로 N+1을 방지한다.
                .leftJoin(post.author)
                .fetchJoin()
                .where(builder)

        QueryDslUtil.applySorting(query, pageable) { property ->
            when (property) {
                "createdAt" -> post.createdAt
                "modifiedAt" -> post.modifiedAt
                "authorName" -> post.author.nickname
                else -> null
            }
        }

        if (pageable.sort.isEmpty) query.orderBy(post.id.desc())

        return query
            .offset(pageable.offset)
            .limit(pageable.pageSize.toLong())
    }

    /**
     * CountQuery 항목을 생성한다.
     */
    private fun createCountQuery(builder: BooleanBuilder): JPAQuery<Long> =
        queryFactory
            .select(post.count())
            .from(post)
            .where(builder)
}
