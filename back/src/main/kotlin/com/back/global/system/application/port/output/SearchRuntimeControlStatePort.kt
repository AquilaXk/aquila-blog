package com.back.global.system.application.port.output

import com.back.global.system.model.SearchRuntimeControlKey
import com.back.global.system.model.SearchRuntimeControlState

interface SearchRuntimeControlStatePort {
    fun findByControlKey(controlKey: SearchRuntimeControlKey): SearchRuntimeControlState?

    fun findAllByControlKeyIn(controlKeys: Set<SearchRuntimeControlKey>): List<SearchRuntimeControlState>

    fun findByControlKeyWithLock(controlKey: SearchRuntimeControlKey): SearchRuntimeControlState?
}
