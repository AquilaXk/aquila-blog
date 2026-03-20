package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.model.shared.Member
import com.back.boundedContexts.post.model.Post
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
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.Pageable
import org.springframework.data.support.PageableExecutionUtils

/**
 * PostRepositoryImpl는 영속 계층(JPA/쿼리) 연동을 담당하는 퍼시스턴스 어댑터입니다.
 * 도메인 요구사항에 맞는 조회/저장 연산을 DB 구현으로 매핑합니다.
 */
class PostRepositoryImpl(
    private val queryFactory: JPAQueryFactory,
) : PostRepositoryCustom {
    companion object {
        private const val META_TAGS_INDEX_ATTR_NAME = "metaTagsIndex"
    }

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
        val tagLikeToken = buildTagLikeToken(tag)
        if (tag != null && tag.isNotBlank() && tagLikeToken == null) {
            return PageImpl(emptyList(), pageable, 0)
        }

        if (publicOnly) {
            builder.and(post.published.isTrue)
            builder.and(post.listed.isTrue)
        }
        author?.let { builder.and(post.author.eq(it)) }
        if (kw.isNotBlank()) builder.and(buildKwPredicate(kw))
        if (tagLikeToken != null) builder.and(buildTagIndexPredicate(tagLikeToken))

        val postIds = fetchPagedPostIds(builder, pageable)
        val posts = fetchPostsByIds(postIds)
        if (shouldSkipCountQuery(publicOnly, pageable)) {
            return PageImpl(posts, pageable, estimateTotalElements(pageable, posts.size))
        }

        // count는 join/fetchJoin 없이 별도 쿼리로 계산해 페이지네이션 비용을 낮춘다.
        val countQuery = createCountQuery(builder)
        return PageableExecutionUtils.getPage(posts, pageable) { countQuery.fetchOne() ?: 0L }
    }

    private fun buildKwPredicate(kw: String): BooleanExpression =
        Expressions.booleanTemplate(
            "function('pgroonga_post_match', {0}, {1}, {2}) = true",
            post.title,
            post.content,
            Expressions.constant(kw),
        )

    private fun buildTagIndexPredicate(tagLikeToken: String): BooleanExpression =
        post.id.`in`(
            JPAExpressions
                .select(postAttr.subject.id)
                .from(postAttr)
                .where(
                    postAttr.name
                        .eq(META_TAGS_INDEX_ATTR_NAME)
                        .and(postAttr.strValue.isNotNull)
                        .and(postAttr.strValue.lower().like(tagLikeToken)),
                ),
        )

    private fun normalizeTagToken(tag: String): String = tag.trim().lowercase()

    private fun buildTagLikeToken(tag: String?): String? {
        val raw = tag?.trim().orEmpty()
        if (raw.isBlank()) return null

        val normalizedTag = normalizeTagToken(raw)
        val safeTagToken =
            normalizedTag
                .replace("%", "")
                .replace("_", "")
                .replace("\\", "")
        if (safeTagToken.isBlank()) return null
        return "%|$safeTagToken|%"
    }

    /**
     * 페이지 목록 조회는 먼저 id만 정렬/페이징으로 가져와서(offset/limit),
     * 이후 본문 엔티티+author를 한 번에 hydrate 하는 2단계 전략을 사용한다.
     * (fetchJoin + distinct + offset 동시 사용으로 인한 비용 증가를 완화)
     */
    private fun fetchPagedPostIds(
        builder: BooleanBuilder,
        pageable: Pageable,
    ): List<Long> {
        val idQuery =
            queryFactory
                .select(post.id)
                .from(post)
        if (requiresAuthorSort(pageable)) {
            idQuery.leftJoin(post.author)
        }

        idQuery.where(builder)

        QueryDslUtil.applySorting(idQuery, pageable) { property ->
            when (property) {
                "createdAt" -> post.createdAt
                "modifiedAt" -> post.modifiedAt
                "authorName" -> post.author.nickname
                else -> null
            }
        }

        if (pageable.sort.isEmpty) idQuery.orderBy(post.id.desc())

        return idQuery
            .offset(pageable.offset)
            .limit(pageable.pageSize.toLong())
            .fetch()
            .filterNotNull()
    }

    private fun requiresAuthorSort(pageable: Pageable): Boolean = pageable.sort.any { it.property == "authorName" }

    /**
     * id 목록 기반으로 Post + author를 로드하고, id 순서를 그대로 복원한다.
     */
    private fun fetchPostsByIds(ids: List<Long>): List<Post> {
        if (ids.isEmpty()) return emptyList()

        val rows =
            queryFactory
                .selectDistinct(post)
                .from(post)
                .leftJoin(post.author)
                .fetchJoin()
                .where(post.id.`in`(ids))
                .fetch()

        if (rows.size <= 1) return rows

        val orderById = ids.withIndex().associate { (index, id) -> id to index }
        return rows.sortedBy { row -> orderById[row.id] ?: Int.MAX_VALUE }
    }

    /**
     * CountQuery 항목을 생성한다.
     */
    private fun createCountQuery(builder: BooleanBuilder): JPAQuery<Long> =
        queryFactory
            .select(post.id.countDistinct())
            .from(post)
            .where(builder)

    /**
     * 공개 목록의 깊은 페이지는 전체 카운트 비용이 커서 생략하고 추정 total을 사용한다.
     * 마지막 페이지 판단은 `fetchedSize < pageSize`이면 확정하고, 그 외에는 다음 페이지 존재 가능성을 1건으로 표현한다.
     */
    private fun shouldSkipCountQuery(
        publicOnly: Boolean,
        pageable: Pageable,
    ): Boolean = publicOnly && pageable.pageNumber > 0

    private fun estimateTotalElements(
        pageable: Pageable,
        fetchedSize: Int,
    ): Long {
        val safeFetched = fetchedSize.coerceAtLeast(0)
        val safePageSize = pageable.pageSize.coerceAtLeast(1)
        val consumed = pageable.offset + safeFetched
        return if (safeFetched < safePageSize) consumed else consumed + 1L
    }
}
