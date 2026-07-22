package com.back.global.security.config

enum class RuntimeApiMode {
    ALL,
    READ,
    ADMIN,
    WORKER,
    NONE,
    ;

    companion object {
        fun from(raw: String): RuntimeApiMode {
            val normalized = raw.trim().lowercase()
            return when (normalized) {
                "all" -> ALL
                "read", "reader" -> READ
                "admin", "write", "writer" -> ADMIN
                "worker" -> WORKER
                "none" -> NONE
                else ->
                    throw IllegalStateException(
                        "Unknown custom.runtime.apiMode='$raw'. Allowed: all, read, admin, worker, none.",
                    )
            }
        }
    }
}
