package com.back.global.security.adapter.persistence

import com.back.global.security.model.AuthSecurityEvent
import org.springframework.data.jpa.repository.JpaRepository

interface AuthSecurityEventRepository : JpaRepository<AuthSecurityEvent, Long>
