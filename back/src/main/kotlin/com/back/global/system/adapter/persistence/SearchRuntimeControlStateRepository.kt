package com.back.global.system.adapter.persistence

import com.back.global.system.application.port.output.SearchRuntimeControlStatePort
import com.back.global.system.model.SearchRuntimeControlKey
import com.back.global.system.model.SearchRuntimeControlState
import jakarta.persistence.LockModeType
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param

interface SearchRuntimeControlStateRepository :
    JpaRepository<SearchRuntimeControlState, SearchRuntimeControlKey>,
    SearchRuntimeControlStatePort {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select state from SearchRuntimeControlState state where state.controlKey = :controlKey")
    override fun findByControlKeyWithLock(
        @Param("controlKey") controlKey: SearchRuntimeControlKey,
    ): SearchRuntimeControlState?
}
