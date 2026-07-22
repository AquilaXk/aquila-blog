package com.back.global.storage.config

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("StoragePrefixIsolation 테스트")
class StoragePrefixIsolationTest {
    @Test
    @DisplayName("기본 posts/cloud prefix 조합은 통과한다")
    fun acceptsDefaultIsolatedPrefixes() {
        assertThatCode {
            StoragePrefixIsolation.validate(
                postKeyPrefix = "posts",
                cloudKeyPrefix = "cloud",
            )
        }.doesNotThrowAnyException()
    }

    @Test
    @DisplayName("공백 post prefix는 기동 검증에서 실패한다")
    fun rejectsBlankPostPrefix() {
        assertThatThrownBy {
            StoragePrefixIsolation.validate(
                postKeyPrefix = "  ",
                cloudKeyPrefix = "cloud",
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("keyPrefix must be non-blank")
    }

    @Test
    @DisplayName("공백 cloud prefix는 기동 검증에서 실패한다")
    fun rejectsBlankCloudPrefix() {
        assertThatThrownBy {
            StoragePrefixIsolation.validate(
                postKeyPrefix = "posts",
                cloudKeyPrefix = "",
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("cloudKeyPrefix must be non-blank")
    }

    @Test
    @DisplayName("동일 prefix는 상호 배타 위반으로 실패한다")
    fun rejectsDuplicatePrefixes() {
        assertThatThrownBy {
            StoragePrefixIsolation.validate(
                postKeyPrefix = "shared",
                cloudKeyPrefix = "/shared/",
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("mutually exclusive")
    }

    @Test
    @DisplayName("경로 포함 관계 prefix는 상호 배타 위반으로 실패한다")
    fun rejectsContainedPrefixes() {
        assertThatThrownBy {
            StoragePrefixIsolation.validate(
                postKeyPrefix = "posts",
                cloudKeyPrefix = "posts/images",
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("mutually exclusive")

        assertThatThrownBy {
            StoragePrefixIsolation.validate(
                postKeyPrefix = "cloud/files",
                cloudKeyPrefix = "cloud",
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("mutually exclusive")
    }

    @Test
    @DisplayName("접두 문자열이어도 경로 세그먼트가 다르면 허용한다")
    fun allowsNonPathSegmentPrefixCollision() {
        assertThat(StoragePrefixIsolation.overlaps("cloud", "cloud-backup")).isFalse()
        assertThatCode {
            StoragePrefixIsolation.validate(
                postKeyPrefix = "cloud-posts",
                cloudKeyPrefix = "cloud",
            )
        }.doesNotThrowAnyException()
    }
}
