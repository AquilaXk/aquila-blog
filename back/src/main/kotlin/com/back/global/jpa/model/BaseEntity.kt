package com.back.global.jpa.model

import jakarta.persistence.MappedSuperclass
import jakarta.persistence.PostLoad
import jakarta.persistence.PostPersist
import jakarta.persistence.Transient
import org.hibernate.Hibernate
import org.springframework.data.domain.Persistable

/**
 * BaseEntity는 글로벌 모듈 도메인 상태와 규칙을 표현하는 모델입니다.
 * 불변조건을 유지하며 상태 전이를 메서드 단위로 캡슐화합니다.
 */
@MappedSuperclass
abstract class BaseEntity : Persistable<Int> {
    abstract val id: Int

    @Transient
    // Spring Data Persistable 규약: true면 insert, false면 update 경로로 처리된다.
    private var isNewEntity: Boolean = true

    @Transient
    // 동일 요청 내에서 계산/조회한 파생 속성을 캐시해 중복 연산을 줄인다.
    private val attrCache: MutableMap<String, Any> = mutableMapOf()

    override fun getId(): Int = id

    override fun isNew(): Boolean = isNewEntity

    @PostPersist
    @PostLoad
    private fun markNotNew() {
        isNewEntity = false
    }

    @Suppress("UNCHECKED_CAST")
    fun <T : Any> getOrPutAttr(
        key: String,
        defaultValue: () -> T,
    ): T = attrCache.getOrPut(key, defaultValue) as T

    /**
     * equals 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 도메인 계층에서 불변조건을 유지하며 상태 전이를 제어합니다.
     */
    override fun equals(other: Any?): Boolean {
        if (other === this) return true
        if (other !is BaseEntity) return false

        if (id == 0 || other.id == 0) return false
        if (identityClass(this) != identityClass(other)) return false

        return id == other.id
    }

    override fun hashCode(): Int =
        if (id == 0) {
            identityClass(this).hashCode()
        } else {
            31 * identityClass(this).hashCode() + id.hashCode()
        }

    private fun effectiveClass(entity: Any): Class<*> = Hibernate.getClass(entity)

    /**
     * identityClass 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 도메인 계층에서 불변조건을 유지하며 상태 전이를 제어합니다.
     */
    private fun identityClass(entity: Any): Class<*> {
        var clazz = effectiveClass(entity)

        // MemberProxy 같은 도메인 프록시는 실제 엔티티 클래스 기준으로 동일성 비교해야 한다.
        while (
            clazz.superclass != null &&
            BaseEntity::class.java.isAssignableFrom(clazz.superclass) &&
            clazz.superclass != BaseEntity::class.java &&
            clazz.superclass != BaseTime::class.java
        ) {
            clazz = clazz.superclass
        }

        return clazz
    }
}
