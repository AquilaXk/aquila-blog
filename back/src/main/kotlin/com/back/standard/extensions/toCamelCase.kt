package com.back.standard.extensions

fun String.toCamelCase() =
    this
        .split("_")
        .mapIndexed { index, word ->
            if (index == 0)
                word.lowercase()
            else
                word.lowercase().replaceFirstChar { it.uppercase() }
        }.joinToString("")
