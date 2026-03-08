package com.back.standard.dto

import java.util.UUID

interface Payload {
    val uid: UUID
    val aggregateType: String
    val aggregateId: Int
}
