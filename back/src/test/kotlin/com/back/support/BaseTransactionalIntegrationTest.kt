package com.back.support

import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional

@SpringBootTest
@Transactional
abstract class BaseTransactionalIntegrationTest : BaseIntegrationTest()
