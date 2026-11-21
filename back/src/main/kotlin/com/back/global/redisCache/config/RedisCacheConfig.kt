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
import org.springframework.data.redis.cache.BatchStrategies
import org.springframework.data.redis.cache.RedisCacheConfiguration
import org.springframework.data.redis.cache.RedisCacheManager
import org.springframework.data.redis.cache.RedisCacheWriter
import org.springframework.data.redis.connection.RedisConnectionFactory
import org.springframework.data.redis.serializer.GenericJacksonJsonRedisSerializer
import org.springframework.data.redis.serializer.RedisSerializationContext
import org.springframework.data.redis.serializer.RedisSerializer
import org.springframework.scheduling.annotation.EnableScheduling
import tools.jackson.databind.jsontype.BasicPolymorphicTypeValidator
import java.time.Duration

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

        // Spring Data Redis 4.x부터 RedisCacheWriter의 put/evict/clear 기본 동작이 비동기(fire-and-forget)다.
        // 이 저장소의 무효화 경로는 동기 적용을 전제로 한다: PostReadCacheInvalidator가 evict 직후의 read를
        // 최신으로 보고, PostWriteSideEffectHandler는 evict 예외를 잡아 task를 재시도한다. 비동기 기본값에서는
        // 쓰기 직후 read가 stale 스냅샷을 돌려주고(read-your-write 위반), evict가 실패해도 예외가 오지 않아
        // task가 성공으로 완료된다. immediateWrites로 동기 적용을 복구한다. (issue #1533)
        val cacheWriter =
            RedisCacheWriter.create(redisConnectionFactory) { configurer ->
                configurer.batchStrategy(BatchStrategies.scan(1_000)).immediateWrites()
            }

        return RedisCacheManager
            .builder(cacheWriter)
            .cacheDefaults(defaultConfig)
            .withInitialCacheConfigurations(perCacheConfigs)
            .build()
    }
}
