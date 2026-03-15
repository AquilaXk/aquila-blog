package com.back.global.redisCache.config

import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.cache.CacheManager
import org.springframework.cache.annotation.EnableCaching
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.data.redis.cache.RedisCacheConfiguration
import org.springframework.data.redis.cache.RedisCacheManager
import org.springframework.data.redis.connection.RedisConnectionFactory
import org.springframework.data.redis.serializer.GenericJacksonJsonRedisSerializer
import org.springframework.data.redis.serializer.RedisSerializationContext
import org.springframework.scheduling.annotation.EnableScheduling
import tools.jackson.databind.jsontype.BasicPolymorphicTypeValidator
import java.time.Duration

@Configuration
@EnableCaching
@EnableScheduling
@EnableConfigurationProperties(RedisCacheProperties::class)
class RedisCacheConfig(
    private val properties: RedisCacheProperties,
) {
    @Bean
    fun cacheManager(redisConnectionFactory: RedisConnectionFactory): CacheManager {
        val ptv =
            BasicPolymorphicTypeValidator
                .builder()
                // Any 허용 대신 애플리케이션/표준 타입으로 범위를 제한한다.
                .allowIfSubType("com.back.")
                .allowIfSubType("java.util.")
                .allowIfSubType("java.time.")
                .allowIfSubType("kotlin.")
                .build()
        val serializer =
            GenericJacksonJsonRedisSerializer
                .builder()
                .enableDefaultTyping(ptv)
                .build()

        val defaultConfig =
            RedisCacheConfiguration
                .defaultCacheConfig()
                .entryTtl(Duration.ofSeconds(properties.ttlSeconds))
                .serializeValuesWith(
                    RedisSerializationContext.SerializationPair.fromSerializer(serializer),
                )

        val perCacheConfigs =
            properties.ttlOverrides.mapValues { (_, seconds) ->
                defaultConfig.entryTtl(Duration.ofSeconds(seconds))
            }

        return RedisCacheManager
            .builder(redisConnectionFactory)
            .cacheDefaults(defaultConfig)
            .withInitialCacheConfigurations(perCacheConfigs)
            .build()
    }
}
