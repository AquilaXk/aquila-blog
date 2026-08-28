package com.back.global.security.config

import jakarta.servlet.http.HttpServletRequest
import java.util.Locale

internal object AuthRequestMethodPolicy {
    private val MUTATING_METHODS = setOf("POST", "PUT", "PATCH", "DELETE")

    fun isMutating(request: HttpServletRequest): Boolean = normalizedMethod(request) in MUTATING_METHODS

    private fun normalizedMethod(request: HttpServletRequest): String =
        request.method
            ?.trim()
            ?.uppercase(Locale.ROOT)
            .orEmpty()
}
