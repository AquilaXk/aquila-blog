package com.back.global.redisCache.config

import org.slf4j.LoggerFactory
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.cache.Cache
import org.springframework.cache.CacheManager
import org.springframework.cache.annotation.CachingConfigurer
import org.springframework.cache.annotation.EnableCaching
import org.springframework.cache.interceptor.CacheErrorHandler
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.data.redis.cache.RedisCacheConfiguration
import org.springframework.data.redis.cache.RedisCacheManager
import org.springframework.data.redis.connection.RedisConnectionFactory
import org.springframework.data.redis.serializer.GenericJacksonJsonRedisSerializer
import org.springframework.data.redis.serializer.RedisSerializationContext
import org.springframework.data.redis.serializer.RedisSerializer
import org.springframework.scheduling.annotation.EnableScheduling
import tools.jackson.databind.jsontype.BasicPolymorphicTypeValidator
import java.time.Duration

/**
 * RedisCacheConfig는 글로벌 런타임 동작을 정의하는 설정 클래스입니다.
 * 보안, 캐시, 세션, JPA, 스케줄링 등 공통 인프라 설정을 등록합니다.
 */

@Configuration
@EnableCaching
@EnableScheduling
@EnableConfigurationProperties(RedisCacheProperties::class)
class RedisCacheConfig(
    private val properties: RedisCacheProperties,
) : CachingConfigurer {
    private val logger = LoggerFactory.getLogger(RedisCacheConfig::class.java)
    private val cacheErrorHandlerDelegate =
        object : CacheErrorHandler {
            override fun handleCacheGetError(
                exception: RuntimeException,
                cache: Cache,
                key: Any,
            ) {
                logger.warn("Cache GET failed (cache={}, key={}), fallback to source", cache.name, key, exception)
                runCatching { cache.evict(key) }
            }

            override fun handleCachePutError(
                exception: RuntimeException,
                cache: Cache,
                key: Any,
                value: Any?,
            ) {
                logger.warn("Cache PUT failed (cache={}, key={})", cache.name, key, exception)
            }

            override fun handleCacheEvictError(
                exception: RuntimeException,
                cache: Cache,
                key: Any,
            ) {
                logger.warn("Cache EVICT failed (cache={}, key={})", cache.name, key, exception)
            }

            override fun handleCacheClearError(
                exception: RuntimeException,
                cache: Cache,
            ) {
                logger.warn("Cache CLEAR failed (cache={})", cache.name, exception)
            }
        }

    override fun errorHandler(): CacheErrorHandler = cacheErrorHandlerDelegate

    @Bean("errorHandler")
    fun springCacheErrorHandler(): CacheErrorHandler = cacheErrorHandlerDelegate

    @Bean
    fun cacheErrorHandler(): CacheErrorHandler = cacheErrorHandlerDelegate

    /**
     * cacheManager 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
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
                // Kotlin data class / java.time 역직렬화를 위해 모듈을 자동 등록한다.
                .customize { mapperBuilder -> mapperBuilder.findAndAddModules() }
                .build()
        val safeSerializer =
            object : RedisSerializer<Any> {
                override fun serialize(value: Any?): ByteArray = serializer.serialize(value) ?: ByteArray(0)

                override fun deserialize(bytes: ByteArray?): Any? =
                    try {
                        serializer.deserialize(bytes)
                    } catch (exception: Exception) {
                        logger.warn(
                            "Cache DESERIALIZE failed (bytes={}), fallback to source",
                            bytes?.size ?: 0,
                            exception,
                        )
                        null
                    }
            }

        val defaultConfig =
            RedisCacheConfiguration
                .defaultCacheConfig()
                .entryTtl(Duration.ofSeconds(properties.ttlSeconds))
                .serializeValuesWith(
                    RedisSerializationContext.SerializationPair.fromSerializer(safeSerializer),
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
