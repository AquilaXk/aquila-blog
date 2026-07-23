variable "region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "prefix" {
  description = "Prefix for resource names"
  type        = string
  default     = "blog"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidr" {
  description = "Public subnet CIDR block"
  type        = string
  default     = "10.0.1.0/24"
}

variable "availability_zone" {
  description = "Availability Zone for EC2"
  type        = string
  default     = "ap-northeast-2a"
}

variable "instance_type" {
  description = "Cost-effective blog server instance type (Graviton)"
  type        = string
  default     = "t4g.small"
}

variable "root_volume_size" {
  description = "EC2 root volume size (GB)"
  type        = number
  default     = 30
}

variable "ssh_public_key" {
  description = "SSH public key content for EC2 access"
  type        = string
}

variable "key_name" {
  description = "AWS key pair name"
  type        = string
  default     = "blog-key"
}
