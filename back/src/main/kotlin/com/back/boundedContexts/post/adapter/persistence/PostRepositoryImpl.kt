package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.domain.PostAttr
import com.back.boundedContexts.post.dto.PostInteractionReadStateDto
import com.back.boundedContexts.post.dto.PublicPostDetailContentCacheDto
import com.back.boundedContexts.post.model.PostSummarySource
import com.back.boundedContexts.post.model.QPost.post
import com.back.boundedContexts.post.model.QPostTagIndex.postTagIndex
import com.back.global.security.application.ContentHtmlTrustState
import com.back.standard.dto.post.type1.PostSearchSortType1
import com.back.standard.util.QueryDslUtil
import com.querydsl.core.BooleanBuilder
import com.querydsl.core.Tuple
import com.querydsl.core.types.dsl.BooleanExpression
import com.querydsl.core.types.dsl.Expressions
import com.querydsl.core.types.dsl.NumberExpression
import com.querydsl.jpa.JPAExpressions
import com.querydsl.jpa.impl.JPAQuery
import com.querydsl.jpa.impl.JPAQueryFactory
import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext
import org.hibernate.engine.spi.SharedSessionContractImplementor
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.Pageable
import org.springframework.data.support.PageableExecutionUtils
import java.time.Instant

class PostRepositoryImpl(
    private val queryFactory: JPAQueryFactory,
) : PostRepositoryCustom {
    @field:PersistenceContext
    private var entityManager: EntityManager? = null

    private data class KeywordRelevanceWeights(
        val title: Int,
        val tag: Int,
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

        return selectSummaryPostQuery()
            .where(builder)
            .orderBy(post.createdAt.desc(), post.id.desc())
            .limit(safeLimit.toLong())
            .fetch()
            .map(::toSummaryPost)
    }

    override fun findPublicDetailById(id: Long): Post? =
        queryFactory
            .selectFrom(post)
            .leftJoin(post.author)
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

    override fun findInteractionReadStateById(id: Long): PostInteractionReadStateDto? =
        queryFactory
            .select(
                post.id,
                post.author.id,
                post.published,
                post.hitCount,
                post.likesCount,
            ).from(post)
            .where(post.id.eq(id))
            .fetchOne()
            ?.let { tuple ->
                PostInteractionReadStateDto(
                    id = tuple.get(post.id)!!,
                    authorId = tuple.get(post.author.id)!!,
                    published = tuple.get(post.published)!!,
                    hitCount = tuple.get(post.hitCount)!!,
                    likesCount = tuple.get(post.likesCount)!!,
                )
            }

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
            when (adminStatus) {
                "draft" ->
                    builder.and(post.published.isFalse.and(post.isTempDraft.isTrue))
                "published" -> builder.and(post.published.isTrue)
                "private" -> builder.and(post.published.isFalse.and(post.isTempDraft.isFalse))
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
        if (pageable.offset == 0L && posts.size < pageable.pageSize) {
            return PageImpl(posts, pageable, posts.size.toLong())
        }

        // count는 join/fetchJoin 없이 별도 쿼리로 계산하고 마지막 페이지는 COUNT 쿼리를 생략한다.
        return PageableExecutionUtils.getPage(posts, pageable) { createCountQuery(builder).fetchOne() ?: 0L }
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

        idQuery.where(builder)

        when (sort) {
            PostSearchSortType1.HIT_COUNT -> idQuery.orderBy(post.hitCount.desc(), post.id.desc())
            PostSearchSortType1.LIKES_COUNT -> idQuery.orderBy(post.likesCount.desc(), post.id.desc())
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

    private fun buildPGroongaMatchPredicate(token: String): BooleanExpression {
        val sanitizedToken = sanitizePGroongaQueryToken(token) ?: return Expressions.booleanTemplate("1 = 0")
        return Expressions.booleanTemplate(
            "function('pgroonga_post_match', {0}, {1}, {2}) = true",
            post.title,
            post.content,
            Expressions.constant(sanitizedToken),
        )
    }

    private fun sanitizePGroongaQueryToken(raw: String): String? {
        if (raw.isEmpty()) return null
        val sb = StringBuilder(raw.length)
        var pendingSpace = false
        for (i in 0 until raw.length) {
            val ch = raw[i]
            val code = ch.code
            val isSeparator =
                if (code < 128) {
                    (ASCII_SEARCH_CHAR_FLAGS[code].toInt() and (FLAG_PGROONGA_SPECIAL or FLAG_WHITESPACE)) != 0
                } else {
                    ch.isWhitespace()
                }
            if (isSeparator) {
                if (sb.isNotEmpty()) {
                    pendingSpace = true
                }
            } else {
                if (pendingSpace) {
                    sb.append(' ')
                    pendingSpace = false
                }
                sb.append(ch)
            }
        }
        return if (sb.isEmpty()) null else sb.toString()
    }

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
                val cursorCount = cursorSortValue.toInt()
                post.hitCount
                    .lt(cursorCount)
                    .or(post.hitCount.eq(cursorCount).and(post.id.lt(cursorId)))
            }
            PostSearchSortType1.LIKES_COUNT -> {
                val cursorCount = cursorSortValue.toInt()
                post.likesCount
                    .lt(cursorCount)
                    .or(post.likesCount.eq(cursorCount).and(post.id.lt(cursorId)))
            }
            PostSearchSortType1.CREATED_AT_ASC -> {
                val cursorCreatedAt = resolveCursorInstant(cursorSortValue)
                post.createdAt
                    .gt(cursorCreatedAt)
                    .or(post.createdAt.eq(cursorCreatedAt).and(post.id.gt(cursorId)))
            }
            else -> {
                val cursorCreatedAt = resolveCursorInstant(cursorSortValue)
                post.createdAt
                    .lt(cursorCreatedAt)
                    .or(post.createdAt.eq(cursorCreatedAt).and(post.id.lt(cursorId)))
            }
        }
    }

    private fun resolveCursorInstant(cursorSortValue: Long): Instant =
        if (kotlin.math.abs(cursorSortValue) >= 100_000_000_000_000L) {
            Instant.ofEpochSecond(
                Math.floorDiv(cursorSortValue, 1_000_000L),
                Math.floorMod(cursorSortValue, 1_000_000L) * 1_000L,
            )
        } else {
            Instant.ofEpochMilli(cursorSortValue)
        }

    private fun normalizeTagToken(tag: String): String = tag.trim().lowercase()

    private fun buildSafeTagToken(tag: String?): String? {
        val raw = tag?.trim().orEmpty()
        if (raw.isBlank()) return null

        return normalizeTagToken(raw).takeIf { it.isNotBlank() }
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
        if (requiresHitCountSort(pageable)) {
            idQuery.orderBy(
                post.hitCount.desc(),
                post.id.desc(),
            )
        } else if (requiresLikesCountSort(pageable)) {
            idQuery.orderBy(
                post.likesCount.desc(),
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
                    "id" -> post.id
                    "createdAt" -> post.createdAt
                    "modifiedAt" -> post.modifiedAt
                    "authorName" -> post.author.nickname
                    else -> null
                }
            }

            if (pageable.sort.isEmpty) {
                idQuery.orderBy(post.id.desc())
            } else if (pageable.sort.none { it.property == "id" }) {
                val primaryAscending = pageable.sort.firstOrNull()?.isAscending == true
                idQuery.orderBy(if (primaryAscending) post.id.asc() else post.id.desc())
            }
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
            selectSummaryPostQuery()
                .where(post.id.`in`(ids))
                .fetch()
                .map(::toSummaryPost)

        if (rows.size <= 1) return rows

        val orderById = ids.withIndex().associate { (index, id) -> id to index }
        return rows.sortedBy { row -> orderById[row.id] ?: Int.MAX_VALUE }
    }

    private fun selectSummaryPostQuery(): JPAQuery<Tuple> =
        queryFactory
            .select(
                post.id,
                post.createdAt,
                post.modifiedAt,
                post.title,
                post.content,
                post.version,
                post.published,
                post.listed,
                post.summaryText,
                post.summarySource,
                post.summaryContentHash,
                post.summaryAlgorithmVersion,
                post.summaryGeneratedAt,
                post.thumbnail,
                post.isTempDraft,
                post.likesCount,
                post.hitCount,
                post.author,
            ).from(post)
            .leftJoin(post.author)

    private fun toSummaryPost(tuple: Tuple): Post {
        val loadedAuthor = tuple.get(post.author)!!
        val loadedCreatedAt = tuple.get(post.createdAt)
        val loadedModifiedAt = tuple.get(post.modifiedAt)
        return Post(
            id = tuple.get(post.id)!!,
            author = loadedAuthor,
            title = tuple.get(post.title)!!,
            content = tuple.get(post.content)!!,
            version = tuple.get(post.version),
            published = tuple.get(post.published)!!,
            listed = tuple.get(post.listed)!!,
            contentHtml = null,
            summaryText = tuple.get(post.summaryText),
            summarySource = tuple.get(post.summarySource) ?: PostSummarySource.NONE,
            summaryContentHash = tuple.get(post.summaryContentHash),
            summaryAlgorithmVersion = tuple.get(post.summaryAlgorithmVersion),
            summaryGeneratedAt = tuple.get(post.summaryGeneratedAt),
            thumbnail = tuple.get(post.thumbnail),
            isTempDraft = tuple.get(post.isTempDraft)!!,
            likesCount = tuple.get(post.likesCount)!!,
            hitCount = tuple.get(post.hitCount)!!,
        ).apply {
            loadedCreatedAt?.let { createdAt = it }
            loadedModifiedAt?.let { modifiedAt = it }
        }
    }

    private fun createCountQuery(builder: BooleanBuilder): JPAQuery<Long> =
        queryFactory
            .select(post.id.count())
            .from(post)
            .where(builder)

    /**
     * 공개 목록은 count 비용이 커서 모든 페이지에서 추정 total을 사용한다.
     * 마지막 페이지 판단은 `fetchedSize < pageSize`이면 확정하고, 그 외에는 다음 페이지 존재 가능성을 1건으로 표현한다.
     */
    private fun shouldSkipCountQuery(publicOnly: Boolean): Boolean = publicOnly

    /**
     * 참조 블로그의 검색 랭킹 전략(제목 우선 + 보조 신호)을 반영해
     * title > tags(post_tag_index) > content 순서로 점수를 부여한다.
     * 멀티 토큰 검색은 exact phrase와 token hit를 함께 반영해 후보 풀이 recency로 과도하게 쏠리지 않게 유지한다.
     */
    private fun buildKeywordRelevanceExpression(keyword: String): NumberExpression<Int> {
        val keywordTerms = buildKeywordTerms(keyword)
        if (keywordTerms.isEmpty()) return zeroScore()

        return keywordTerms.withIndex().fold(zeroScore()) { acc, (index, term) ->
            val weights =
                if (index == 0) {
                    KeywordRelevanceWeights(title = 300, tag = 120)
                } else {
                    KeywordRelevanceWeights(title = 110, tag = 45)
                }

            acc
                .add(buildLikeScore(post.title, buildEscapedLikePattern(term), weights.title))
                .add(buildTagScore(term, weights.tag))
        }
    }

    private fun buildKeywordTerms(keyword: String): List<String> {
        val normalizedKeyword = keyword.trim().lowercase()
        if (normalizedKeyword.isEmpty()) return emptyList()

        val result = ArrayList<String>(5)
        result.add(normalizedKeyword)

        var tokenCount = 0
        var i = 0
        val len = normalizedKeyword.length
        while (i < len && tokenCount < 4) {
            while (i < len && isSearchWhitespace(normalizedKeyword[i])) i++
            if (i >= len) break
            val start = i
            while (i < len && !isSearchWhitespace(normalizedKeyword[i])) i++
            if (i - start >= 2) {
                val token = normalizedKeyword.substring(start, i)
                if (!result.contains(token)) {
                    result.add(token)
                    tokenCount++
                }
            }
        }
        return result
    }

    private fun isSearchWhitespace(ch: Char): Boolean {
        val code = ch.code
        return if (code < 128) (ASCII_SEARCH_CHAR_FLAGS[code].toInt() and FLAG_WHITESPACE) != 0 else ch.isWhitespace()
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
        var start = 0
        var end = raw.length
        while (start < end && raw[start].isWhitespace()) start++
        while (end > start && raw[end - 1].isWhitespace()) end--
        val sb = StringBuilder(end - start + 8).append('%')
        var i = start
        while (i < end) {
            val ch = raw[i]
            val code = ch.code
            if (ch == '\\' || ch == '%' || ch == '_') {
                sb.append('\\').append(ch)
            } else if (code in 'A'.code..'Z'.code) {
                sb.append((code or 0x20).toChar())
            } else if (code < 128) {
                sb.append(ch)
            } else {
                sb.append(ch.lowercase())
            }
            i++
        }
        return sb.append('%').toString()
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

    override fun updateHitCount(
        targetPost: Post,
        hitCount: Int,
        hitCountAttr: PostAttr?,
    ) {
        syncLoadedCounterState(targetPost, "hitCount", hitCount, "hitCountAttr", hitCountAttr)
        if (hitCountAttr != null) {
            syncLoadedAttrState(hitCountAttr, hitCount)
        }
        val updateClause =
            queryFactory
                .update(post)
                .set(post.hitCount, hitCount)
        if (hitCountAttr != null) {
            updateClause.set(post.hitCountAttr, hitCountAttr)
        }
        updateClause.where(post.id.eq(targetPost.id)).execute()
    }

    override fun updateLikesCount(
        targetPost: Post,
        likesCount: Int,
        likesCountAttr: PostAttr?,
    ) {
        syncLoadedCounterState(targetPost, "likesCount", likesCount, "likesCountAttr", likesCountAttr)
        if (likesCountAttr != null) {
            syncLoadedAttrState(likesCountAttr, likesCount)
        }
        val updateClause =
            queryFactory
                .update(post)
                .set(post.likesCount, likesCount)
        if (likesCountAttr != null) {
            updateClause.set(post.likesCountAttr, likesCountAttr)
        }
        updateClause.where(post.id.eq(targetPost.id)).execute()
    }

    private fun syncLoadedCounterState(
        targetPost: Post,
        counterProperty: String,
        counterValue: Int,
        attrProperty: String,
        attrValue: PostAttr?,
    ) {
        val em = entityManager ?: return
        if (!em.contains(targetPost)) return
        val session = em.unwrap(SharedSessionContractImplementor::class.java)
        val targetEntity = org.hibernate.Hibernate.unproxy(targetPost)
        val entry = session.persistenceContextInternal.getEntry(targetEntity) ?: return
        val loadedState = entry.loadedState ?: return
        val propertyNames = entry.persister.propertyNames
        val counterIdx = propertyNames.indexOf(counterProperty)
        if (counterIdx >= 0) {
            loadedState[counterIdx] = counterValue
        }
        if (attrValue != null) {
            val attrIdx = propertyNames.indexOf(attrProperty)
            if (attrIdx >= 0) {
                loadedState[attrIdx] = attrValue
            }
        }
    }

    private fun syncLoadedAttrState(
        attr: PostAttr,
        counterValue: Int,
    ) {
        val em = entityManager ?: return
        if (!em.contains(attr)) return
        val session = em.unwrap(SharedSessionContractImplementor::class.java)
        val targetAttr = org.hibernate.Hibernate.unproxy(attr)
        val entry = session.persistenceContextInternal.getEntry(targetAttr) ?: return
        val loadedState = entry.loadedState ?: return
        val intValueIdx = entry.persister.propertyNames.indexOf("intValue")
        if (intValueIdx >= 0) {
            if (loadedState[intValueIdx] != counterValue) {
                em
                    .createNativeQuery(
                        """
                        update post_attr
                        set int_value = :counterValue,
                            modified_at = now()
                        where id = :id
                          and int_value is distinct from :counterValue
                        """.trimIndent(),
                    ).setParameter("counterValue", counterValue)
                    .setParameter("id", attr.id)
                    .executeUpdate()
            }
            loadedState[intValueIdx] = counterValue
        }
    }

    companion object {
        private const val FLAG_PGROONGA_SPECIAL = 1
        private const val FLAG_WHITESPACE = 2
        private val ASCII_SEARCH_CHAR_FLAGS =
            ByteArray(128).apply {
                for (c in "\"'()\\+-*~<>:@^$?[]{}|") {
                    this[c.code] = (this[c.code].toInt() or FLAG_PGROONGA_SPECIAL).toByte()
                }
                for (c in charArrayOf(' ', '\t', '\n', '\r', '\u000B', '\u000C', '\u001C', '\u001D', '\u001E', '\u001F')) {
                    this[c.code] = (this[c.code].toInt() or FLAG_WHITESPACE).toByte()
                }
            }
    }
}
