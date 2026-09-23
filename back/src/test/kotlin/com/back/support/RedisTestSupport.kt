package com.back.support

import org.springframework.data.redis.core.StringRedisTemplate

object RedisTestSupport {
    fun clearKeys(
        redisTemplate: StringRedisTemplate?,
        pattern: String,
    ) {
        if (redisTemplate == null) return
        val keys = redisTemplate.keys(pattern)
        if (!keys.isNullOrEmpty()) {
            redisTemplate.delete(keys)
        }
    }
}
