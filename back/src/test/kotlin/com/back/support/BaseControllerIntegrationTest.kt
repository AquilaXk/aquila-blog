package com.back.support

import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.test.web.servlet.MockMvc
import org.springframework.transaction.annotation.Transactional

@AutoConfigureMockMvc
@Transactional
abstract class BaseControllerIntegrationTest : BaseSeededIntegrationTest() {
    @Autowired
    protected lateinit var mvc: MockMvc
}
