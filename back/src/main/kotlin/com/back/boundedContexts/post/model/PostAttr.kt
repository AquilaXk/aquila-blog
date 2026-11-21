package com.back.boundedContexts.post.model

import com.back.global.jpa.domain.BaseTime
import com.back.global.jpa.domain.EntityAttr
import jakarta.persistence.*
import jakarta.persistence.FetchType.LAZY
import jakarta.persistence.GenerationType.SEQUENCE
import org.hibernate.annotations.DynamicUpdate
import org.hibernate.annotations.NaturalId

/**
 * PostAttr는 비즈니스 상태와 규칙을 캡슐화하는 도메인 모델입니다.
 * 도메인 불변조건을 지키며 상태 변경을 메서드 단위로 통제합니다.
 */
@Entity
@DynamicUpdate
@Table(
    uniqueConstraints = [
        UniqueConstraint(columnNames = ["subject_id", "name"]),
    ],
)
class PostAttr private constructor(
    @field:Id
    @field:SequenceGenerator(name = "post_attr_seq_gen", sequenceName = "post_attr_seq", allocationSize = 50)
    @field:GeneratedValue(strategy = SEQUENCE, generator = "post_attr_seq_gen")
    override val id: Long = 0,
    @field:NaturalId
    @field:ManyToOne(fetch = LAZY)
    @field:JoinColumn(nullable = false)
    val subject: Post,
    @field:NaturalId
    @field:Column(nullable = false)
    val name: String,
    override var intValue: Int? = null,
    @field:Column(columnDefinition = "TEXT")
    override var strValue: String? = null,
) : BaseTime(),
    EntityAttr {
    constructor(id: Long, subject: Post, name: String, value: Int) : this(id, subject, name, intValue = value)
    constructor(id: Long, subject: Post, name: String, value: String) : this(id, subject, name, strValue = value)
}
