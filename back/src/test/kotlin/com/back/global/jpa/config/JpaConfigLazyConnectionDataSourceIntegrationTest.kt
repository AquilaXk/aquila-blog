package com.back.global.jpa.config

import com.back.support.BaseSeededPerformanceIntegrationTest
import com.zaxxer.hikari.HikariDataSource
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.LazyConnectionDataSourceProxy
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import javax.sql.DataSource

class JpaConfigLazyConnectionDataSourceIntegrationTest : BaseSeededPerformanceIntegrationTest() {
    @Autowired
    private lateinit var dataSource: DataSource

    @Autowired
    private lateinit var platformTransactionManager: PlatformTransactionManager

    @Autowired
    private lateinit var jdbcTemplate: JdbcTemplate

    @Test
    fun `주입된 primary dataSource는 이중 래핑 없이 LazyConnectionDataSourceProxy로 감싸진다`() {
        assertThat(dataSource).isInstanceOf(LazyConnectionDataSourceProxy::class.java)
        val proxy = dataSource as LazyConnectionDataSourceProxy
        val target = proxy.targetDataSource
        assertThat(target).isInstanceOf(HikariDataSource::class.java)
        assertThat(target).isNotInstanceOf(LazyConnectionDataSourceProxy::class.java)
    }

    @Test
    fun `SQL을 실행하지 않는 readOnly 트랜잭션은 물리 커넥션을 점유하지 않는다`() {
        val hikari = (dataSource as LazyConnectionDataSourceProxy).targetDataSource as HikariDataSource
        val poolBean = hikari.hikariPoolMXBean
        val baselineActive = poolBean.activeConnections

        val readOnlyTemplate =
            TransactionTemplate(platformTransactionManager).apply {
                isReadOnly = true
                propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
            }

        var activeInsideEmptyTx = -1
        readOnlyTemplate.executeWithoutResult {
            activeInsideEmptyTx = poolBean.activeConnections
        }
        assertThat(activeInsideEmptyTx).isEqualTo(baselineActive)

        var activeInsideSqlTx = -1
        val value =
            readOnlyTemplate.execute {
                val selected = jdbcTemplate.queryForObject("SELECT 1", Int::class.java)
                activeInsideSqlTx = poolBean.activeConnections
                selected
            }
        assertThat(value).isEqualTo(1)
        assertThat(activeInsideSqlTx).isGreaterThanOrEqualTo(baselineActive + 1)
    }

    @Test
    fun `BeanPostProcessor는 primary dataSource만 한 번 감싸고 이미 감싼 프록시나 타 빈은 유지한다`() {
        val processor = JpaConfig.lazyConnectionDataSourceProxyBeanPostProcessor()
        val rawDataSource = mock(DataSource::class.java)

        val wrapped = processor.postProcessAfterInitialization(rawDataSource, "dataSource")
        assertThat(wrapped).isInstanceOf(LazyConnectionDataSourceProxy::class.java)
        assertThat((wrapped as LazyConnectionDataSourceProxy).targetDataSource).isSameAs(rawDataSource)

        val alreadyWrapped = processor.postProcessAfterInitialization(wrapped, "dataSource")
        assertThat(alreadyWrapped).isSameAs(wrapped)

        val secondaryDataSource = mock(DataSource::class.java)
        assertThat(processor.postProcessAfterInitialization(secondaryDataSource, "secondaryDataSource"))
            .isSameAs(secondaryDataSource)

        val otherBean = "plainBean"
        assertThat(processor.postProcessAfterInitialization(otherBean, "dataSource")).isSameAs(otherBean)
        verifyNoInteractions(rawDataSource, secondaryDataSource)
    }
}
