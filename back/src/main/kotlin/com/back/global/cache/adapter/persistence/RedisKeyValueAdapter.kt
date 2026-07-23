package com.back.global.cache.adapter.persistence

import com.back.global.cache.application.port.output.RedisKeyValuePort
import org.springframework.beans.factory.ObjectProvider
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Component
import java.time.Duration

@Component
class RedisTemplateKeyValuePortAdapter(
    private val redisTemplateProvider: ObjectProvider<StringRedisTemplate>,
) : RedisKeyValuePort {
    override fun isAvailable(): Boolean = redisTemplateProvider.getIfAvailable() != null

    override fun get(key: String): String? = redisTemplateProvider.getIfAvailable()?.opsForValue()?.get(key)

    override fun set(
        key: String,
        value: String,
        ttl: Duration?,
    ) {
        val redisTemplate = redisTemplateProvider.getIfAvailable() ?: return
        if (ttl == null) {
            redisTemplate.opsForValue().set(key, value)
            return
        }
        redisTemplate.opsForValue().set(key, value, ttl)
    }

    override fun increment(key: String): Long? = redisTemplateProvider.getIfAvailable()?.opsForValue()?.increment(key)

    override fun expire(
        key: String,
        ttl: Duration,
    ): Boolean = redisTemplateProvider.getIfAvailable()?.expire(key, ttl) ?: false

    override fun delete(keys: Collection<String>): Long {
        if (keys.isEmpty()) return 0L
        return redisTemplateProvider.getIfAvailable()?.delete(keys) ?: 0L
    }

    override fun keys(pattern: String): Set<String> = redisTemplateProvider.getIfAvailable()?.keys(pattern).orEmpty()
}
