package com.back.support

import com.back.boundedContexts.post.adapter.persistence.PostDeletedQueryRepository
import com.back.global.jpa.config.JpaConfig
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase
import org.springframework.context.annotation.Import

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(JpaConfig::class, PostDeletedQueryRepository::class)
abstract class BaseRepositoryIntegrationTest : BaseIntegrationTest()
