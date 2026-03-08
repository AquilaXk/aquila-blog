package com.back.boundedContexts.post.domain

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
        UniqueConstraint(columnNames = ["subject_id", "name"])
    ]
)
class PostAttr private constructor(
    @field:Id
    @field:SequenceGenerator(name = "post_attr_seq_gen", sequenceName = "post_attr_seq", allocationSize = 50)
    @field:GeneratedValue(strategy = SEQUENCE, generator = "post_attr_seq_gen")
    override val id: Int = 0,

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
) : BaseTime(), EntityAttr {
    constructor(id: Int, subject: Post, name: String, value: Int) : this(id, subject, name, intValue = value)
    constructor(id: Int, subject: Post, name: String, value: String) : this(id, subject, name, strValue = value)
}