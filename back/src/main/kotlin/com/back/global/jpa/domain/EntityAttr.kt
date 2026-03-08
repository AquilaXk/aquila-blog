package com.back.global.jpa.domain

interface EntityAttr {
    var intValue: Int?
    var strValue: String?

    var value: Any?
        get() = intValue ?: strValue
        set(value) {
            when (value) {
                is Int -> {
                    intValue = value
                }

                is String -> {
                    strValue = value
                }
            }
        }
}
