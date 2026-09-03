package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.model.shared.QMemberAttr
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.PublicPostDetailContentCacheDto
import com.back.boundedContexts.post.model.QPost.post
import com.back.boundedContexts.post.model.QPostTagIndex.postTagIndex
import com.back.global.security.application.ContentHtmlTrustState
import com.back.standard.dto.post.type1.PostSearchSortType1
import com.back.standard.util.QueryDslUtil
import com.querydsl.core.BooleanBuilder
import com.querydsl.core.types.dsl.BooleanExpression
import com.querydsl.core.types.dsl.Expressions
import com.querydsl.core.types.dsl.NumberExpression
import com.querydsl.jpa.JPAExpressions
import com.querydsl.jpa.impl.JPAQuery
import com.querydsl.jpa.impl.JPAQueryFactory
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.Pageable
import org.springframework.data.support.PageableExecutionUtils
import java.time.Instant

/**
 * PostRepositoryImpl는 영속 계층(JPA/쿼리) 연동을 담당하는 퍼시스턴스 어댑터입니다.
 * 도메인 요구사항에 맞는 조회/저장 연산을 DB 구현으로 매핑합니다.
 */
class PostRepositoryImpl(
    private val queryFactory: JPAQueryFactory,
) : PostRepositoryCustom {
    private data class KeywordRelevanceWeights(
        val title: Int,
        val tag: Int,
        val content: Int,
    )

    override fun findQPagedByKw(
        kw: String,
        pageable: Pageable,
    ): Page<Post> = findPosts(null, kw, pageable, publicOnly = true)

    override fun findQPagedByKwForAdmin(
        kw: String,
        pageable: Pageable,
        status: String,
    ): Page<Post> = findPosts(null, kw, pageable, publicOnly = false, adminStatus = status)

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

    override fun findPublicByCursor(
        cursorSortValue: Long?,
        cursorId: Long?,
        limit: Int,
        sort: PostSearchSortType1,
    ): List<Post> = findPublicPostsByCursor(cursorSortValue, cursorId, limit, sort, tag = null)

    override fun findPublicByTagCursor(
        tag: String,
        cursorSortValue: Long?,
        cursorId: Long?,
        limit: Int,
        sort: PostSearchSortType1,
    ): List<Post> = findPublicPostsByCursor(cursorSortValue, cursorId, limit, sort, tag = tag)

    override fun findPublicByAuthorExceptPost(
        authorId: Long,
        excludePostId: Long?,
        limit: Int,
    ): List<Post> {
        if (authorId <= 0L || limit <= 0) return emptyList()
        val safeLimit = limit.coerceIn(1, 20)
        val builder =
            BooleanBuilder()
                .and(post.published.isTrue)
                .and(post.listed.isTrue)
                .and(post.author.id.eq(authorId))

        excludePostId?.takeIf { it > 0L }?.let { builder.and(post.id.ne(it)) }

        return queryFactory
            .selectDistinct(post)
            .from(post)
            .leftJoin(post.author)
            .fetchJoin()
            .where(builder)
            .orderBy(post.createdAt.desc(), post.id.desc())
            .limit(safeLimit.toLong())
            .fetch()
    }

    override fun findPublicDetailById(id: Long): Post? =
        queryFactory
            .selectFrom(post)
            .leftJoin(post.author)
            .fetchJoin()
            .leftJoin(post.likesCountAttr)
            .fetchJoin()
            .leftJoin(post.hitCountAttr)
            .fetchJoin()
            .where(
                post.id
                    .eq(id)
                    .and(post.published.isTrue),
            ).fetchOne()

    override fun findPublicDetailContentById(id: Long): PublicPostDetailContentCacheDto? =
        queryFactory
            .select(
                post.content,
                post.contentHtml,
                post.contentHtmlHash,
                post.contentHtmlSanitizerPolicyVersion,
                post.contentHtmlTrustState,
            ).from(post)
            .where(
                post.id
                    .eq(id)
                    .and(post.published.isTrue),
            ).fetchOne()
            ?.let { tuple ->
                val content = tuple.get(post.content) ?: return null
                PublicPostDetailContentCacheDto(
                    content = content,
                    contentHtml = tuple.get(post.contentHtml),
                    contentHtmlHash = tuple.get(post.contentHtmlHash),
                    contentHtmlSanitizerPolicyVersion = tuple.get(post.contentHtmlSanitizerPolicyVersion),
                    contentHtmlTrustState = tuple.get(post.contentHtmlTrustState) ?: ContentHtmlTrustState.UNKNOWN,
                )
            }

    override fun findAllPublicListedContents(): List<String> =
        queryFactory
            .select(post.content)
            .from(post)
            .where(post.published.isTrue.and(post.listed.isTrue))
            .fetch()

    private fun findPosts(
        author: Member?,
        kw: String,
        pageable: Pageable,
        publicOnly: Boolean = false,
        tag: String? = null,
        adminStatus: String = "all",
    ): Page<Post> {
        val builder = BooleanBuilder()
        val safeTagToken = buildSafeTagToken(tag)
        if (tag != null && tag.isNotBlank() && safeTagToken == null) {
            return PageImpl(emptyList(), pageable, 0)
        }

        if (publicOnly) {
            builder.and(post.published.isTrue)
            builder.and(post.listed.isTrue)
        } else {
            val activeDraftMarker = QMemberAttr("activeDraftMarker")
            val hasActiveDraftMarker =
                JPAExpressions
                    .selectOne()
                    .from(activeDraftMarker)
                    .where(
                        activeDraftMarker.subject
                            .eq(post.author)
                            .and(activeDraftMarker.name.eq("activeTempDraftPostId"))
                            .and(activeDraftMarker.strValue.trim().eq(post.id.stringValue())),
                    ).exists()
            when (adminStatus) {
                "draft" ->
                    builder.and(post.published.isFalse.and(hasActiveDraftMarker))
                "published" -> builder.and(post.published.isTrue)
                "private" -> builder.and(post.published.isFalse.and(hasActiveDraftMarker.not()))
            }
        }
        author?.let { builder.and(post.author.eq(it)) }
        if (kw.isNotBlank()) builder.and(buildKwPredicate(kw))
        if (safeTagToken != null) {
            builder.and(buildPostTagIndexPredicate(safeTagToken))
        }

        val postIds = fetchPagedPostIds(builder, pageable, kw)
        val posts = fetchPostsByIds(postIds)
        if (shouldSkipCountQuery(publicOnly)) {
            return PageImpl(posts, pageable, estimateTotalElements(pageable, posts.size))
        }

        // count는 join/fetchJoin 없이 별도 쿼리로 계산해 페이지네이션 비용을 낮춘다.
        val countQuery = createCountQuery(builder)
        return PageableExecutionUtils.getPage(posts, pageable) { countQuery.fetchOne() ?: 0L }
    }

    private fun findPublicPostsByCursor(
        cursorSortValue: Long?,
        cursorId: Long?,
        limit: Int,
        sort: PostSearchSortType1,
        tag: String?,
    ): List<Post> {
        val safeLimit = limit.coerceIn(1, 100)
        val builder =
            BooleanBuilder()
                .and(post.published.isTrue)
                .and(post.listed.isTrue)

        val safeTagToken = buildSafeTagToken(tag)
        if (tag != null && tag.isNotBlank() && safeTagToken == null) {
            return emptyList()
        }
        if (safeTagToken != null) {
            builder.and(buildPostTagIndexPredicate(safeTagToken))
        }
        buildCursorPredicate(cursorSortValue, cursorId, sort)?.let(builder::and)

        val idQuery =
            queryFactory
                .select(post.id)
                .from(post)

        when (sort) {
            PostSearchSortType1.HIT_COUNT -> idQuery.leftJoin(post.hitCountAttr)
            PostSearchSortType1.LIKES_COUNT -> idQuery.leftJoin(post.likesCountAttr)
            else -> Unit
        }

        idQuery.where(builder)

        when (sort) {
            PostSearchSortType1.HIT_COUNT -> {
                val countExpr = post.hitCountAttr.intValue.coalesce(0)
                idQuery.orderBy(countExpr.desc(), post.id.desc())
            }
            PostSearchSortType1.LIKES_COUNT -> {
                val countExpr = post.likesCountAttr.intValue.coalesce(0)
                idQuery.orderBy(countExpr.desc(), post.id.desc())
            }
            PostSearchSortType1.CREATED_AT_ASC -> idQuery.orderBy(post.createdAt.asc(), post.id.asc())
            else -> idQuery.orderBy(post.createdAt.desc(), post.id.desc())
        }

        val ids =
            idQuery
                .limit(safeLimit.toLong())
                .fetch()
                .filterNotNull()

        return fetchPostsByIds(ids)
    }

    private fun buildKwPredicate(kw: String): BooleanExpression {
        val normalizedKeyword = kw.trim()
        val keywordTerms = buildKeywordTerms(normalizedKeyword)
        val basePredicate = buildKeywordTokenPredicate(normalizedKeyword)

        return keywordTerms.drop(1).fold(basePredicate) { acc, token ->
            acc.or(buildKeywordTokenPredicate(token))
        }
    }

    private fun buildKeywordTokenPredicate(token: String): BooleanExpression {
        val normalizedTag = buildSafeTagToken(token)
        val tagPredicate =
            if (normalizedTag == null) {
                Expressions.booleanTemplate("1 = 0")
            } else {
                buildPostTagIndexPredicate(normalizedTag)
            }

        return buildPGroongaMatchPredicate(token).or(tagPredicate)
    }

    private fun buildPGroongaMatchPredicate(token: String): BooleanExpression =
        Expressions.booleanTemplate(
            "function('pgroonga_post_match', {0}, {1}, {2}) = true",
            post.title,
            post.content,
            Expressions.constant(token),
        )

    private fun buildPostTagIndexPredicate(normalizedTag: String): BooleanExpression =
        JPAExpressions
            .selectOne()
            .from(postTagIndex)
            .where(
                postTagIndex.postId
                    .eq(post.id)
                    .and(postTagIndex.tag.lower().eq(normalizedTag)),
            ).exists()

    private fun buildCursorPredicate(
        cursorSortValue: Long?,
        cursorId: Long?,
        sort: PostSearchSortType1,
    ): BooleanExpression? {
        if (cursorSortValue == null || cursorId == null || cursorId <= 0L) return null
        return when (sort) {
            PostSearchSortType1.HIT_COUNT -> {
                val countExpr = post.hitCountAttr.intValue.coalesce(0)
                val cursorCount = cursorSortValue.toInt()
                countExpr
                    .lt(cursorCount)
                    .or(countExpr.eq(cursorCount).and(post.id.lt(cursorId)))
            }
            PostSearchSortType1.LIKES_COUNT -> {
                val countExpr = post.likesCountAttr.intValue.coalesce(0)
                val cursorCount = cursorSortValue.toInt()
                countExpr
                    .lt(cursorCount)
                    .or(countExpr.eq(cursorCount).and(post.id.lt(cursorId)))
            }
            PostSearchSortType1.CREATED_AT_ASC -> {
                val cursorCreatedAt = Instant.ofEpochMilli(cursorSortValue)
                post.createdAt
                    .gt(cursorCreatedAt)
                    .or(post.createdAt.eq(cursorCreatedAt).and(post.id.gt(cursorId)))
            }
            else -> {
                val cursorCreatedAt = Instant.ofEpochMilli(cursorSortValue)
                post.createdAt
                    .lt(cursorCreatedAt)
                    .or(post.createdAt.eq(cursorCreatedAt).and(post.id.lt(cursorId)))
            }
        }
    }

    private fun normalizeTagToken(tag: String): String = tag.trim().lowercase()

    private fun buildSafeTagToken(tag: String?): String? {
        val raw = tag?.trim().orEmpty()
        if (raw.isBlank()) return null

        val normalizedTag = normalizeTagToken(raw)
        val safeTagToken =
            normalizedTag
                .replace("%", "")
                .replace("_", "")
                .replace("\\", "")
        if (safeTagToken.isBlank()) return null
        return safeTagToken
    }

    /**
     * 페이지 목록 조회는 먼저 id만 정렬/페이징으로 가져와서(offset/limit),
     * 이후 본문 엔티티+author를 한 번에 hydrate 하는 2단계 전략을 사용한다.
     * (fetchJoin + distinct + offset 동시 사용으로 인한 비용 증가를 완화)
     */
    private fun fetchPagedPostIds(
        builder: BooleanBuilder,
        pageable: Pageable,
        kw: String,
    ): List<Long> {
        val idQuery =
            queryFactory
                .select(post.id)
                .from(post)
        if (requiresAuthorSort(pageable)) {
            idQuery.leftJoin(post.author)
        }
        if (requiresHitCountSort(pageable)) {
            idQuery.leftJoin(post.hitCountAttr)
        }
        if (requiresLikesCountSort(pageable)) {
            idQuery.leftJoin(post.likesCountAttr)
        }

        idQuery.where(builder)

        val normalizedKeyword = kw.trim()
        if (requiresHitCountSort(pageable)) {
            idQuery.orderBy(
                post.hitCountAttr.intValue
                    .coalesce(0)
                    .desc(),
                post.id.desc(),
            )
        } else if (requiresLikesCountSort(pageable)) {
            idQuery.orderBy(
                post.likesCountAttr.intValue
                    .coalesce(0)
                    .desc(),
                post.id.desc(),
            )
        } else if (normalizedKeyword.isNotBlank()) {
            idQuery.orderBy(
                buildKeywordRelevanceExpression(normalizedKeyword).desc(),
                post.createdAt.desc(),
                post.id.desc(),
            )
        } else {
            QueryDslUtil.applySorting(idQuery, pageable) { property ->
                when (property) {
                    "createdAt" -> post.createdAt
                    "modifiedAt" -> post.modifiedAt
                    "authorName" -> post.author.nickname
                    else -> null
                }
            }

            if (pageable.sort.isEmpty) idQuery.orderBy(post.id.desc())
        }

        return idQuery
            .offset(pageable.offset)
            .limit(pageable.pageSize.toLong())
            .fetch()
            .filterNotNull()
    }

    private fun requiresAuthorSort(pageable: Pageable): Boolean = pageable.sort.any { it.property == "authorName" }

    private fun requiresHitCountSort(pageable: Pageable): Boolean = pageable.sort.any { it.property == "hitCount" }

    private fun requiresLikesCountSort(pageable: Pageable): Boolean = pageable.sort.any { it.property == "likesCount" }

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

    private fun createCountQuery(builder: BooleanBuilder): JPAQuery<Long> =
        queryFactory
            .select(post.id.countDistinct())
            .from(post)
            .where(builder)

    /**
     * 공개 목록은 countDistinct 비용이 커서 모든 페이지에서 추정 total을 사용한다.
     * 마지막 페이지 판단은 `fetchedSize < pageSize`이면 확정하고, 그 외에는 다음 페이지 존재 가능성을 1건으로 표현한다.
     */
    private fun shouldSkipCountQuery(publicOnly: Boolean): Boolean = publicOnly

    /**
     * Velog의 검색 랭킹 전략(제목 우선 + 보조 신호)을 반영해
     * title > tags(post_tag_index) > content 순서로 점수를 부여한다.
     * 멀티 토큰 검색은 exact phrase와 token hit를 함께 반영해 후보 풀이 recency로 과도하게 쏠리지 않게 유지한다.
     */
    private fun buildKeywordRelevanceExpression(keyword: String): NumberExpression<Int> {
        val keywordTerms = buildKeywordTerms(keyword)
        if (keywordTerms.isEmpty()) return zeroScore()

        return keywordTerms.withIndex().fold(zeroScore()) { acc, (index, term) ->
            val weights =
                if (index == 0) {
                    KeywordRelevanceWeights(title = 300, tag = 120, content = 40)
                } else {
                    KeywordRelevanceWeights(title = 110, tag = 45, content = 20)
                }

            acc
                .add(buildLikeScore(post.title, buildEscapedLikePattern(term), weights.title))
                .add(buildTagScore(term, weights.tag))
                .add(buildLikeScore(post.content, buildEscapedLikePattern(term), weights.content))
        }
    }

    private fun buildKeywordTerms(keyword: String): List<String> {
        val normalizedKeyword = keyword.trim().lowercase()
        if (normalizedKeyword.isBlank()) return emptyList()

        val splitTokens =
            normalizedKeyword
                .split(Regex("\\s+"))
                .map(String::trim)
                .filter { it.length >= 2 }
                .distinct()
                .take(4)

        return buildList(splitTokens.size + 1) {
            add(normalizedKeyword)
            addAll(splitTokens.filterNot { it == normalizedKeyword })
        }
    }

    private fun buildLikeScore(
        target: Any,
        likePattern: String,
        weight: Int,
    ): NumberExpression<Int> =
        Expressions.numberTemplate(
            Int::class.java,
            "case when lower({0}) like {1} then {2} else 0 end",
            target,
            Expressions.constant(likePattern),
            Expressions.constant(weight),
        )

    private fun buildTagScore(
        term: String,
        weight: Int,
    ): NumberExpression<Int> {
        val hasTagMatch =
            buildSafeTagToken(term)
                ?.let(::buildPostTagIndexPredicate)
                ?: Expressions.booleanTemplate("1 = 0")

        return Expressions.numberTemplate(
            Int::class.java,
            "case when {0} then {1} else 0 end",
            hasTagMatch,
            Expressions.constant(weight),
        )
    }

    private fun zeroScore(): NumberExpression<Int> = Expressions.numberTemplate(Int::class.java, "0")

    private fun buildEscapedLikePattern(raw: String): String {
        val normalized = raw.trim().lowercase()
        val escaped =
            normalized
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_")
        return "%$escaped%"
    }

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
