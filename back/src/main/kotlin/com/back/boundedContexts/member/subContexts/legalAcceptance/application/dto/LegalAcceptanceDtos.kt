package com.back.boundedContexts.member.subContexts.legalAcceptance.application.dto

data class LegalReconsentReport(
    val currentAcceptedMembers: Long,
    val reconsentRequiredMembers: Long,
) {
    val totalMembers: Long = currentAcceptedMembers + reconsentRequiredMembers
    val completionRate: Double =
        if (totalMembers == 0L) {
            1.0
        } else {
            currentAcceptedMembers.toDouble() / totalMembers.toDouble()
        }
}
