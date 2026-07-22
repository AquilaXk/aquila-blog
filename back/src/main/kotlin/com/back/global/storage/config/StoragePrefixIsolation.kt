package com.back.global.storage.config

/**
 * post/cloud object-key prefix 격리 규칙.
 * 공백·중복·경로 포함 관계는 런타임 우회가 아니라 기동/설정 검증에서 실패한다.
 */
object StoragePrefixIsolation {
    fun normalize(raw: String): String = raw.trim().trim('/')

    fun overlaps(
        left: String,
        right: String,
    ): Boolean {
        val a = normalize(left)
        val b = normalize(right)
        if (a.isBlank() || b.isBlank()) return false
        return a == b || a.startsWith("$b/") || b.startsWith("$a/")
    }

    fun validate(
        postKeyPrefix: String,
        cloudKeyPrefix: String,
    ) {
        val postPrefix = normalize(postKeyPrefix)
        val cloudPrefix = normalize(cloudKeyPrefix)
        require(postPrefix.isNotBlank()) {
            "custom.storage.keyPrefix must be non-blank (got blank/whitespace)"
        }
        require(cloudPrefix.isNotBlank()) {
            "custom.storage.cloudKeyPrefix must be non-blank (got blank/whitespace)"
        }
        require(!overlaps(postPrefix, cloudPrefix)) {
            "custom.storage.keyPrefix('$postPrefix') and custom.storage.cloudKeyPrefix('$cloudPrefix') " +
                "must be mutually exclusive (no equality or path containment)"
        }
    }
}
