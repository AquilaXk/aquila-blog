package com.back.global.redisCache.config

import com.back.support.BaseIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.cache.CacheManager

/**
 * Spring Data Redis 4.x의 RedisCacheWriter 기본값은 put/evict/clear를 비동기(fire-and-forget)로 적용한다.
 * 이 저장소의 read cache 무효화 경로는 동기 적용을 전제로 한다. 쓰기 직후의 read가 최신이어야 하고
 * (read-your-write), evict 실패는 예외로 드러나 task가 재시도돼야 한다. 비동기 기본값에서는 두 전제가
 * 모두 조용히 깨진다. RedisCacheConfig가 immediateWrites를 유지하는지 이 계약으로 고정한다. (issue #1533)
 */
@SpringBootTest
@DisplayName("Redis cache 즉시 쓰기 계약 테스트")
class RedisCacheImmediateWriteIntegrationTest : BaseIntegrationTest() {
    @Autowired
    private lateinit var cacheManager: CacheManager

    @Test
    @DisplayName("evict가 반환된 직후의 조회는 캐시 미스여야 한다")
    fun `evict is visible to the immediately following read`() {
        val cache = cacheManager.getCache(CACHE_NAME) ?: error("cache $CACHE_NAME is missing")
        val key = "immediate-write-evict-${System.nanoTime()}"

        repeat(REPEATS) {
            cache.put(key, "value")
            assertThat(cache.get(key)?.get()).isEqualTo("value")

            cache.evict(key)

            assertThat(cache.get(key))
                .describedAs("evict는 반환 직후 조회에 보여야 한다 (RedisCacheWriter immediateWrites)")
                .isNull()
        }
    }

    @Test
    @DisplayName("clear가 반환된 직후의 조회는 캐시 미스여야 한다")
    fun `clear is visible to the immediately following read`() {
        val cache = cacheManager.getCache(CACHE_NAME) ?: error("cache $CACHE_NAME is missing")
        val key = "immediate-write-clear-${System.nanoTime()}"

        repeat(REPEATS) {
            cache.put(key, "value")
            assertThat(cache.get(key)?.get()).isEqualTo("value")

            cache.clear()

            assertThat(cache.get(key))
                .describedAs("clear는 반환 직후 조회에 보여야 한다 (RedisCacheWriter immediateWrites)")
                .isNull()
        }
    }

    private companion object {
        // 실제 read 경로가 쓰는 캐시 이름으로 검증해야 per-cache 설정까지 함께 고정된다.
        private const val CACHE_NAME = "post-detail-public-snapshot-v1"

        // 비동기 쓰기는 단발 실행에서 우연히 통과할 수 있으므로 반복해 race 창을 넓힌다.
        private const val REPEATS = 50
    }
}
