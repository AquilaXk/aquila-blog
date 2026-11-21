package com.back.global.jpa.domain

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

@org.junit.jupiter.api.DisplayName("BaseEntity 테스트")
class BaseEntityTest {
    @Test
    fun `id가 0인 transient 엔티티는 서로 다르다`() {
        val a = TestEntity(0)
        val b = TestEntity(0)

        assertThat(a).isNotEqualTo(b)
    }

    @Test
    fun `id가 같아도 타입이 다르면 서로 다르다`() {
        val a = TestEntity(1)
        val b = AnotherTestEntity(1)

        assertThat(a).isNotEqualTo(b)
    }

    @Test
    fun `id와 타입이 같으면 같은 엔티티다`() {
        val a = TestEntity(1)
        val b = TestEntity(1)

        assertThat(a).isEqualTo(b)
        assertThat(a.hashCode()).isEqualTo(b.hashCode())
    }

    @Test
    fun `동일 엔티티의 프록시 서브타입은 같은 엔티티다`() {
        val a = TestEntity(1)
        val b = TestEntityProxy(1)

        assertThat(a).isEqualTo(b)
        assertThat(b).isEqualTo(a)
        assertThat(a.hashCode()).isEqualTo(b.hashCode())
    }

    private open class TestEntity(
        override val id: Long,
    ) : BaseEntity()

    private class AnotherTestEntity(
        override val id: Long,
    ) : BaseEntity()

    private class TestEntityProxy(
        id: Long,
    ) : TestEntity(id)
}
