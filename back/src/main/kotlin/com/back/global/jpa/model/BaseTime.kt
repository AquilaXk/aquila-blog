package com.back.global.jpa.model

import jakarta.persistence.EntityListeners
import jakarta.persistence.MappedSuperclass
import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.LastModifiedDate
import org.springframework.data.jpa.domain.support.AuditingEntityListener
import java.time.Instant

/**
 * BaseTime는 글로벌 모듈 도메인 상태와 규칙을 표현하는 모델입니다.
 * 불변조건을 유지하며 상태 전이를 메서드 단위로 캡슐화합니다.
 */
@MappedSuperclass
@EntityListeners(AuditingEntityListener::class)
abstract class BaseTime(
    id: Long = 0,
) : BaseEntity() {
    @CreatedDate
    lateinit var createdAt: Instant

    @LastModifiedDate
    lateinit var modifiedAt: Instant

    fun updateModifiedAt() {
        this.modifiedAt = Instant.now()
    }
}
