package com.back.standard.dto.post.type1

import org.springframework.data.domain.Sort

enum class PostSearchSortType1(
    val sortBy: Sort,
) {
    CREATED_AT(Sort.by(Sort.Direction.DESC, "createdAt")),
    CREATED_AT_ASC(Sort.by(Sort.Direction.ASC, "createdAt")),
    MODIFIED_AT(Sort.by(Sort.Direction.DESC, "modifiedAt")),
    MODIFIED_AT_ASC(Sort.by(Sort.Direction.ASC, "modifiedAt")),
    HIT_COUNT(Sort.by(Sort.Direction.DESC, "hitCount")),
    LIKES_COUNT(Sort.by(Sort.Direction.DESC, "likesCount")),
    ;

    val property: String by lazy { sortBy.first().property }

    val isAsc: Boolean by lazy { sortBy.first().isAscending }

    val isCursorSupported: Boolean
        get() =
            when (this) {
                CREATED_AT,
                CREATED_AT_ASC,
                HIT_COUNT,
                LIKES_COUNT,
                -> true
                else -> false
            }

    fun normalizeForCursor(): PostSearchSortType1 = if (isCursorSupported) this else CREATED_AT
}
