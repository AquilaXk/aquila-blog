package com.back.global.jpa.config

import org.hibernate.mapping.Table
import org.hibernate.tool.schema.internal.StandardTableExporter
import org.hibernate.tool.schema.spi.Exporter

/**
 * CustomDevPostgreSQLDialect는 글로벌 런타임 동작을 정의하는 설정 클래스입니다.
 * 보안, 캐시, 세션, JPA, 스케줄링 등 공통 인프라 설정을 등록합니다.
 */
open class CustomDevPostgreSQLDialect : CustomPostgreSQLDialect() {
    private val unloggedTableExporter =
        object : StandardTableExporter(this) {
            override fun tableCreateString(temporary: Boolean): String =
                if (temporary) super.tableCreateString(true) else "create unlogged table"
        }

    override fun getTableExporter(): Exporter<Table> = unloggedTableExporter
}
