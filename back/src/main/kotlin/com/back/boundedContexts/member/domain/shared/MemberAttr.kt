package com.back.boundedContexts.member.domain.shared

import com.back.global.jpa.domain.BaseTime
import com.back.global.jpa.domain.EntityAttr
import jakarta.persistence.*
import jakarta.persistence.FetchType.LAZY
import jakarta.persistence.GenerationType.SEQUENCE
import org.hibernate.annotations.DynamicUpdate
import org.hibernate.annotations.NaturalId

@Entity
@DynamicUpdate
@Table(
    uniqueConstraints = [
        UniqueConstraint(columnNames = ["subject_id", "name"]),
    ],
)
class MemberAttr private constructor(
    @field:Id
    @field:SequenceGenerator(name = "member_attr_seq_gen", sequenceName = "member_attr_seq", allocationSize = 50)
    @field:GeneratedValue(strategy = SEQUENCE, generator = "member_attr_seq")
    override val id: Int = 0,

    @field:NaturalId
    @field:ManyToOne(fetch = LAZY)
    @field:JoinColumn(nullable = false)
    val subject: Member,

    @field:NaturalId
    @field:Column(nullable = false)
    val name: String,

    @field:Column(nullable = true)
    override var intValue: Int? = null,

    @field:Column(columnDefinition = "TEXT", nullable = true)
    override var strValue: String? = null,
) : BaseTime(), EntityAttr {
    constructor(id: Int, subject: Member, name: String, value: Int) : this(id, subject, name, intValue = value)
    constructor(id: Int, subject: Member, name: String, value: String) : this(id, subject, name, strValue = value)
}