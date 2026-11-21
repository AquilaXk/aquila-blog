package com.back.standard.util

import tools.jackson.databind.ObjectMapper

object Ut {
    object JSON {
        lateinit var objectMapper: ObjectMapper

        fun toString(
            obj: Any,
            defaultValue: String = "",
        ): String =
            try {
                objectMapper.writeValueAsString(obj)
            } catch (_: Exception) {
                defaultValue
            }

        inline fun <reified T> fromMap(map: Any?): T = objectMapper.convertValue(map, T::class.java)

        fun <T> fromString(
            json: String,
            cls: Class<T>,
        ): T = objectMapper.readValue(json, cls)

        inline fun <reified T> fromString(json: String): T = objectMapper.readValue(json, T::class.java)
    }
}
