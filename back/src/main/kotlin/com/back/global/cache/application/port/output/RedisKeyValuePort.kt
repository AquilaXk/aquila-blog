package com.back.global.cache.application.port.output

import java.time.Duration

interface RedisKeyValuePort {
    fun isAvailable(): Boolean

    fun get(key: String): String?

    fun set(
        key: String,
        value: String,
        ttl: Duration? = null,
    )

    fun increment(key: String): Long?

    fun expire(
        key: String,
        ttl: Duration,
    ): Boolean

    fun delete(keys: Collection<String>): Long

    fun keys(pattern: String): Set<String>
}
