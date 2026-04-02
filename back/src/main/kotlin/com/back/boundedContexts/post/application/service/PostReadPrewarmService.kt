package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.post.application.port.input.PostPublicReadQueryUseCase
import com.back.standard.dto.post.type1.PostSearchSortType1
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service

/**
 * PostReadPrewarmService는 게시글 쓰기 이후 자주 조회되는 공개 read 캐시를 선가열합니다.
 * 첫 진입 TTFB와 첫 상세 클릭 지연을 줄이기 위한 운영 최적화 전용 서비스입니다.
 */
@Service
class PostReadPrewarmService(
    private val postPublicReadQueryUseCase: PostPublicReadQueryUseCase,
    @Value("\${custom.post.read.prewarm.page-size:30}")
    pageSize: Int,
    @Value("\${custom.post.read.prewarm.max-tag-warmups:3}")
    maxTagWarmups: Int,
) {
    private val logger = LoggerFactory.getLogger(PostReadPrewarmService::class.java)
    private val safePageSize = pageSize.coerceIn(10, 30)
    private val bootstrapWarmPageSizes = listOf(HOME_BOOTSTRAP_PAGE_SIZE, safePageSize).distinct().sorted()
    private val safeMaxTagWarmups = maxTagWarmups.coerceIn(0, 10)

    /**
     * prewarm 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 핵심 경로(feed/explore/tags/detail + 변경 태그 탐색)를 개별 격리 실행해 부분 실패 전파를 막습니다.
     */
    fun prewarm(
        postId: Long,
        tags: List<String>,
        warmDetail: Boolean,
    ) {
        val normalizedTags =
            tags
                .asSequence()
                .map(String::trim)
                .filter(String::isNotBlank)
                .distinct()
                .take(safeMaxTagWarmups)
                .toList()

        val failureReasons = mutableListOf<String>()
        var attemptedSteps = 0
        var hasSuccess = false

        fun runStep(
            stepName: String,
            block: () -> Unit,
        ) {
            attemptedSteps++
            runCatching(block)
                .onSuccess {
                    hasSuccess = true
                }.onFailure { exception ->
                    failureReasons += stepName
                    logger.warn(
                        "post_read_prewarm_step_failed step={} postId={} message={}",
                        stepName,
                        postId,
                        exception.message ?: exception::class.simpleName,
                    )
                }
        }

        runStep("feed-cursor-first") {
            postPublicReadQueryUseCase.getPublicFeedByCursor(
                cursor = null,
                pageSize = safePageSize,
                sort = PostSearchSortType1.CREATED_AT,
            )
        }
        runStep("explore-first") {
            postPublicReadQueryUseCase.getPublicExplore(
                page = 1,
                pageSize = safePageSize,
                kw = "",
                tag = "",
                sort = PostSearchSortType1.CREATED_AT,
            )
        }
        runStep("tags") {
            postPublicReadQueryUseCase.getPublicTagCounts()
        }
        bootstrapWarmPageSizes.forEach { pageSizeToWarm ->
            runStep("bootstrap-home:$pageSizeToWarm") {
                postPublicReadQueryUseCase.getPublicBootstrap(
                    tag = "",
                    pageSize = pageSizeToWarm,
                    sort = PostSearchSortType1.CREATED_AT,
                )
            }
        }
        if (warmDetail) {
            runStep("detail") {
                postPublicReadQueryUseCase.getPublicPostDetail(postId)
            }
        }
        normalizedTags.forEach { tag ->
            runStep("explore-tag:$tag") {
                postPublicReadQueryUseCase.getPublicExploreByCursor(
                    cursor = null,
                    pageSize = safePageSize,
                    tag = tag,
                    sort = PostSearchSortType1.CREATED_AT,
                )
            }
        }

        if (!hasSuccess) {
            throw IllegalStateException(
                "post_read_prewarm_all_failed postId=$postId tags=${normalizedTags.size} steps=${failureReasons.joinToString(",")}",
            )
        }

        logger.debug(
            "post_read_prewarm_done postId={} success={} failures={}",
            postId,
            attemptedSteps - failureReasons.size,
            failureReasons.size,
        )
    }

    companion object {
        private const val HOME_BOOTSTRAP_PAGE_SIZE = 16
    }
}
