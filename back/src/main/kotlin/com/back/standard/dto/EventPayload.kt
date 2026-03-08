package com.back.standard.dto

import com.fasterxml.jackson.annotation.JsonTypeInfo

@JsonTypeInfo(use = JsonTypeInfo.Id.CLASS, property = "@class")
interface EventPayload : Payload
