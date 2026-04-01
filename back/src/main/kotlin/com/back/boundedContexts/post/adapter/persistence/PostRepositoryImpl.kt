package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.dto.PublicPostDetailContentCacheDto
import com.back.boundedContexts.post.model.QPost.post
import com.back.boundedContexts.post.model.QPostAttr.postAttr
import com.back.standard.util.QueryDslUtil
import com.querydsl.core.BooleanBuilder
import com.querydsl.core.types.dsl.BooleanExpression
import com.querydsl.core.types.dsl.Expressions
import com.querydsl.core.types.dsl.NumberExpression
import com.querydsl.jpa.JPAExpressions
import com.querydsl.jpa.impl.JPAQuery
import com.querydsl.jpa.impl.JPAQueryFactory
import org.slf4j.LoggerFactory
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.Pageable
import org.springframework.data.support.PageableExecutionUtils
import java.sql.SQLException
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

    companion object {
        private const val META_TAGS_INDEX_ATTR_NAME = "metaTagsIndex"
        private val logger = LoggerFactory.getLogger(PostRepositoryImpl::class.java)
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

    override fun findPublicByCursor(
        cursorCreatedAt: Instant?,
        cursorId: Long?,
        limit: Int,
        sortAscending: Boolean,
    ): List<Post> = findPublicPostsByCursor(cursorCreatedAt, cursorId, limit, sortAscending, tag = null)

    override fun findPublicByTagCursor(
        tag: String,
        cursorCreatedAt: Instant?,
        cursorId: Long?,
        limit: Int,
        sortAscending: Boolean,
    ): List<Post> = findPublicPostsByCursor(cursorCreatedAt, cursorId, limit, sortAscending, tag = tag)

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
            .leftJoin(post.commentsCountAttr)
            .fetchJoin()
            .leftJoin(post.hitCountAttr)
            .fetchJoin()
            .where(
                post.id
                    .eq(id)
                    .and(post.published.isTrue)
                    .and(post.listed.isTrue),
            ).fetchOne()

    override fun findPublicDetailContentById(id: Long): PublicPostDetailContentCacheDto? =
        queryFactory
            .select(post.content, post.contentHtml)
            .from(post)
            .where(
                post.id
                    .eq(id)
                    .and(post.published.isTrue)
                    .and(post.listed.isTrue),
            ).fetchOne()
            ?.let { tuple ->
                val content = tuple.get(post.content) ?: return null
                PublicPostDetailContentCacheDto(
                    content = content,
                    contentHtml = tuple.get(post.contentHtml),
                )
            }

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
        usePostTagIndexTable: Boolean = false,
    ): Page<Post> {
        // Keep legacy metaTagsIndex as the default path to avoid rollback-only commits
        // when post_tag_index probing fails on partially migrated runtime nodes.
        val builder = BooleanBuilder()
        val safeTagToken = buildSafeTagToken(tag)
        val tagLikeToken = safeTagToken?.let { "%|$it|%" }
        if (tag != null && tag.isNotBlank() && safeTagToken == null) {
            return PageImpl(emptyList(), pageable, 0)
        }

        if (publicOnly) {
            builder.and(post.published.isTrue)
            builder.and(post.listed.isTrue)
        }
        author?.let { builder.and(post.author.eq(it)) }
        if (kw.isNotBlank()) builder.and(buildKwPredicate(kw))
        if (safeTagToken != null && tagLikeToken != null) {
            builder.and(
                buildTagFilterPredicate(
                    normalizedTag = safeTagToken,
                    tagLikeToken = tagLikeToken,
                    usePostTagIndexTable = usePostTagIndexTable,
                ),
            )
        }

        return try {
            val postIds = fetchPagedPostIds(builder, pageable, kw)
            val posts = fetchPostsByIds(postIds)
            if (shouldSkipCountQuery(publicOnly)) {
                return PageImpl(posts, pageable, estimateTotalElements(pageable, posts.size))
            }

            // count는 join/fetchJoin 없이 별도 쿼리로 계산해 페이지네이션 비용을 낮춘다.
            val countQuery = createCountQuery(builder)
            PageableExecutionUtils.getPage(posts, pageable) { countQuery.fetchOne() ?: 0L }
        } catch (exception: RuntimeException) {
            if (safeTagToken != null && usePostTagIndexTable && shouldFallbackToLegacyTagPath(exception)) {
                logger.warn("post_tag_index path failed in findPosts; fallback to metaTagsIndex", exception)
                return findPosts(
                    author = author,
                    kw = kw,
                    pageable = pageable,
                    publicOnly = publicOnly,
                    tag = tag,
                    usePostTagIndexTable = false,
                )
            }
            throw exception
        }
    }

    private fun findPublicPostsByCursor(
        cursorCreatedAt: Instant?,
        cursorId: Long?,
        limit: Int,
        sortAscending: Boolean,
        tag: String?,
        usePostTagIndexTable: Boolean = false,
    ): List<Post> {
        // Keep legacy metaTagsIndex as the default path to avoid rollback-only commits
        // when post_tag_index probing fails on partially migrated runtime nodes.
        val safeLimit = limit.coerceIn(1, 100)
        val builder =
            BooleanBuilder()
                .and(post.published.isTrue)
                .and(post.listed.isTrue)

        val safeTagToken = buildSafeTagToken(tag)
        val tagLikeToken = safeTagToken?.let { "%|$it|%" }
        if (tag != null && tag.isNotBlank() && safeTagToken == null) {
            return emptyList()
        }
        if (safeTagToken != null && tagLikeToken != null) {
            builder.and(
                buildTagFilterPredicate(
                    normalizedTag = safeTagToken,
                    tagLikeToken = tagLikeToken,
                    usePostTagIndexTable = usePostTagIndexTable,
                ),
            )
        }
        buildCursorPredicate(cursorCreatedAt, cursorId, sortAscending)?.let(builder::and)

        return try {
            val idQuery =
                queryFactory
                    .select(post.id)
                    .from(post)
                    .where(builder)

            if (sortAscending) {
                idQuery.orderBy(post.createdAt.asc(), post.id.asc())
            } else {
                idQuery.orderBy(post.createdAt.desc(), post.id.desc())
            }

            val ids =
                idQuery
                    .limit(safeLimit.toLong())
                    .fetch()
                    .filterNotNull()

            fetchPostsByIds(ids)
        } catch (exception: RuntimeException) {
            if (safeTagToken != null && usePostTagIndexTable && shouldFallbackToLegacyTagPath(exception)) {
                logger.warn("post_tag_index path failed in cursor feed; fallback to metaTagsIndex", exception)
                return findPublicPostsByCursor(
                    cursorCreatedAt = cursorCreatedAt,
                    cursorId = cursorId,
                    limit = limit,
                    sortAscending = sortAscending,
                    tag = tag,
                    usePostTagIndexTable = false,
                )
            }
            throw exception
        }
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
        val tagLikeToken = buildTagLikeToken(token)
        val tagPredicate =
            if (tagLikeToken == null) {
                Expressions.booleanTemplate("1 = 0")
            } else {
                buildTagIndexPredicate(tagLikeToken)
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

    private fun buildPostTagIndexPredicate(normalizedTag: String): BooleanExpression =
        Expressions.booleanTemplate(
            "exists (select 1 from post_tag_index pti where pti.post_id = {0} and lower(pti.tag) = {1})",
            post.id,
            Expressions.constant(normalizedTag),
        )

    private fun buildTagFilterPredicate(
        normalizedTag: String,
        tagLikeToken: String,
        usePostTagIndexTable: Boolean,
    ): BooleanExpression = if (usePostTagIndexTable) buildPostTagIndexPredicate(normalizedTag) else buildTagIndexPredicate(tagLikeToken)

    private fun buildCursorPredicate(
        cursorCreatedAt: Instant?,
        cursorId: Long?,
        sortAscending: Boolean,
    ): BooleanExpression? {
        if (cursorCreatedAt == null || cursorId == null || cursorId <= 0L) return null
        return if (sortAscending) {
            post.createdAt
                .gt(cursorCreatedAt)
                .or(post.createdAt.eq(cursorCreatedAt).and(post.id.gt(cursorId)))
        } else {
            post.createdAt
                .lt(cursorCreatedAt)
                .or(post.createdAt.eq(cursorCreatedAt).and(post.id.lt(cursorId)))
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

    private fun buildTagLikeToken(tag: String?): String? {
        val safeTagToken = buildSafeTagToken(tag) ?: return null
        return "%|$safeTagToken|%"
    }

    private fun shouldFallbackToLegacyTagPath(exception: RuntimeException): Boolean {
        val chain = generateSequence(exception as Throwable?) { it?.cause }.toList()
        val sqlException = chain.filterIsInstance<SQLException>().firstOrNull()
        val sqlState = sqlException?.sqlState?.uppercase()
        val unsupportedPostTagIndexState =
            sqlState in
                setOf(
                    "42P01", // postgres: undefined table
                    "42703", // postgres: undefined column
                    "42S02", // h2/mysql: table not found
                    "42S22", // h2/mysql: column not found
                    "42102", // h2: table or view not found
                    "42122", // h2: column not found
                )
        if (unsupportedPostTagIndexState) return true

        val mentionsPostTagIndex =
            chain.any { throwable ->
                throwable.message?.contains("post_tag_index", ignoreCase = true) == true
            }
        return mentionsPostTagIndex && (sqlState == null || sqlState.startsWith("42"))
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

        idQuery.where(builder)

        val normalizedKeyword = kw.trim()
        if (normalizedKeyword.isNotBlank()) {
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
     * 공개 목록은 countDistinct 비용이 커서 모든 페이지에서 추정 total을 사용한다.
     * 마지막 페이지 판단은 `fetchedSize < pageSize`이면 확정하고, 그 외에는 다음 페이지 존재 가능성을 1건으로 표현한다.
     */
    private fun shouldSkipCountQuery(publicOnly: Boolean): Boolean = publicOnly

    /**
     * Velog의 검색 랭킹 전략(제목 우선 + 보조 신호)을 반영해
     * title > tags(metaTagsIndex) > content 순서로 점수를 부여한다.
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
        val tagToken = buildTagLikeToken(term) ?: "||"
        val hasTagMatch =
            JPAExpressions
                .selectOne()
                .from(postAttr)
                .where(
                    postAttr.subject.id
                        .eq(post.id)
                        .and(postAttr.name.eq(META_TAGS_INDEX_ATTR_NAME))
                        .and(postAttr.strValue.isNotNull)
                        .and(postAttr.strValue.lower().like(tagToken)),
                ).exists()

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
