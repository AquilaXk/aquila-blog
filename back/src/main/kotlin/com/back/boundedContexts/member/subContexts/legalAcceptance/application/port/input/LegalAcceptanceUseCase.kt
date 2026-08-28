package com.back.boundedContexts.member.subContexts.legalAcceptance.application.port.input

import com.back.boundedContexts.member.subContexts.legalAcceptance.application.dto.LegalReconsentReport

interface LegalAcceptanceUseCase {
    fun legalReconsentReport(): LegalReconsentReport
}
