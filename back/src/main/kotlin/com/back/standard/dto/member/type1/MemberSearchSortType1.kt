package com.back.standard.dto.member.type1

import org.springframework.data.domain.Sort

enum class MemberSearchSortType1 {
    CREATED_AT,
    CREATED_AT_ASC,
    USERNAME,
    USERNAME_ASC,
    NICKNAME,
    NICKNAME_ASC,
    ;

    val sortBy: Sort by lazy {
        Sort.by(
            if (isAsc) Sort.Direction.ASC else Sort.Direction.DESC,
            property,
        )
    }

    val property: String by lazy {
        name
            .removeSuffix("_ASC")
            .lowercase()
            .split("_")
            .let { parts ->
                parts.first() + parts.drop(1).joinToString("") { it.replaceFirstChar(Char::uppercase) }
            }
    }

    val isAsc: Boolean by lazy { name.endsWith("_ASC") }
}
