package com.back.support

import jakarta.persistence.EntityManager
import org.springframework.core.Ordered
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.TestContext
import org.springframework.test.context.support.AbstractTestExecutionListener

class ResetAndSeedTestExecutionListener : AbstractTestExecutionListener() {
    override fun getOrder(): Int = Ordered.HIGHEST_PRECEDENCE

    override fun beforeTestMethod(testContext: TestContext) {
        databaseCleanup(testContext).resetAndSeed()
    }

    override fun afterTestMethod(testContext: TestContext) {
        databaseCleanup(testContext).cleanup()
    }

    private fun databaseCleanup(testContext: TestContext): DatabaseCleanup =
        DatabaseCleanup(
            jdbcTemplate = testContext.applicationContext.getBean(JdbcTemplate::class.java),
            entityManager = testContext.applicationContext.getBean(EntityManager::class.java),
            applicationContext = testContext.applicationContext,
        )
}
