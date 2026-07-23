package com.back.standard.extensions

fun <T> T?.getOrThrow(): T = this ?: throw NoSuchElementException()
