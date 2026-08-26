package com.back.global.system.application.port.output

import com.back.global.system.model.SearchRuntimeControlKey
import com.back.global.system.model.SearchRuntimeControlState

interface SearchRuntimeControlStatePort {
    fun findByControlKeyWithLock(controlKey: SearchRuntimeControlKey): SearchRuntimeControlState?
}
