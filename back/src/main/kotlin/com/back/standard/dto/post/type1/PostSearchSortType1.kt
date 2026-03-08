package com.back.standard.dto.post.type1

import org.springframework.data.domain.Sort

enum class PostSearchSortType1(val sortBy: Sort) {
    CREATED_AT(Sort.by(Sort.Direction.DESC, "createdAt")),
    CREATED_AT_ASC(Sort.by(Sort.Direction.ASC, "createdAt")),
    MODIFIED_AT(Sort.by(Sort.Direction.DESC, "modifiedAt")),
    MODIFIED_AT_ASC(Sort.by(Sort.Direction.ASC, "modifiedAt")),
}
