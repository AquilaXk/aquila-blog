package com.back.global.jpa.config

import org.hibernate.mapping.Table
import org.hibernate.tool.schema.internal.StandardTableExporter
import org.hibernate.tool.schema.spi.Exporter

open class CustomDevPostgreSQLDialect : CustomPostgreSQLDialect() {
    private val unloggedTableExporter =
        object : StandardTableExporter(this) {
            override fun tableCreateString(temporary: Boolean): String =
                if (temporary) super.tableCreateString(true) else "create unlogged table"
        }

    override fun getTableExporter(): Exporter<Table> = unloggedTableExporter
}
