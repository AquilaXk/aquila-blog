package com.back.global.jpa.config

import com.querydsl.jpa.impl.JPAQueryFactory
import com.zaxxer.hikari.HikariDataSource
import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext
import org.springframework.beans.factory.config.BeanPostProcessor
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.jdbc.datasource.LazyConnectionDataSourceProxy
import javax.sql.DataSource

@Configuration
class JpaConfig {
    @PersistenceContext
    private lateinit var entityManager: EntityManager

    @Bean
    fun jpaQueryFactory(): JPAQueryFactory = JPAQueryFactory(entityManager)

    companion object {
        @JvmStatic
        @Bean
        fun lazyConnectionDataSourceProxyBeanPostProcessor(): BeanPostProcessor =
            object : BeanPostProcessor {
                override fun postProcessAfterInitialization(
                    bean: Any,
                    beanName: String,
                ): Any {
                    if (beanName == "dataSource" && bean is DataSource && bean !is LazyConnectionDataSourceProxy) {
                        return LazyConnectionDataSourceProxy(bean).apply {
                            if (bean is HikariDataSource) {
                                setDefaultAutoCommit(bean.isAutoCommit)
                            }
                        }
                    }
                    return bean
                }
            }
    }
}
