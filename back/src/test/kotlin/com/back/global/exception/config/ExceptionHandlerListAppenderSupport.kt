package com.back.global.exception.config

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import org.slf4j.LoggerFactory

internal object ExceptionHandlerListAppenderSupport {
    fun attach(): ListAppender<ILoggingEvent> {
        val logger = LoggerFactory.getLogger(ExceptionHandler::class.java) as Logger
        return ListAppender<ILoggingEvent>().also {
            it.start()
            logger.addAppender(it)
        }
    }

    fun detach(appender: ListAppender<ILoggingEvent>) {
        val logger = LoggerFactory.getLogger(ExceptionHandler::class.java) as Logger
        logger.detachAppender(appender)
    }
}
