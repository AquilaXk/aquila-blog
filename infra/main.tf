terraform {
  // aws 라이브러리 불러옴
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

# AWS 설정 시작
provider "aws" {
  region = var.region
}
# AWS 설정 끝

# VPC 설정 시작
resource "aws_vpc" "vpc_1" {
  cidr_block = "10.0.0.0/16"

  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${var.prefix}-vpc-1"
  }
}

resource "aws_subnet" "subnet_1" {
  vpc_id                  = aws_vpc.vpc_1.id
  cidr_block              = "10.0.0.0/24"
  availability_zone       = "${var.region}a"
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.prefix}-subnet-1"
  }
}

resource "aws_subnet" "subnet_2" {
  vpc_id                  = aws_vpc.vpc_1.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "${var.region}b"
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.prefix}-subnet-2"
  }
}

resource "aws_subnet" "subnet_3" {
  vpc_id                  = aws_vpc.vpc_1.id
  cidr_block              = "10.0.2.0/24"
  availability_zone       = "${var.region}c"
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.prefix}-subnet-3"
  }
}

resource "aws_subnet" "subnet_4" {
  vpc_id                  = aws_vpc.vpc_1.id
  cidr_block              = "10.0.3.0/24"
  availability_zone       = "${var.region}d"
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.prefix}-subnet-4"
  }
}

resource "aws_internet_gateway" "igw_1" {
  vpc_id = aws_vpc.vpc_1.id

  tags = {
    Name = "${var.prefix}-igw-1"
  }
}

resource "aws_route_table" "rt_1" {
  vpc_id = aws_vpc.vpc_1.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw_1.id
  }

  tags = {
    Name = "${var.prefix}-rt-1"
  }
}

resource "aws_route_table_association" "association_1" {
  subnet_id      = aws_subnet.subnet_1.id
  route_table_id = aws_route_table.rt_1.id
}

resource "aws_route_table_association" "association_2" {
  subnet_id      = aws_subnet.subnet_2.id
  route_table_id = aws_route_table.rt_1.id
}

resource "aws_route_table_association" "association_3" {
  subnet_id      = aws_subnet.subnet_3.id
  route_table_id = aws_route_table.rt_1.id
}

resource "aws_route_table_association" "association_4" {
  subnet_id      = aws_subnet.subnet_4.id
  route_table_id = aws_route_table.rt_1.id
}

resource "aws_security_group" "sg_1" {
  name = "${var.prefix}-sg-1"

  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  vpc_id = aws_vpc.vpc_1.id

  tags = {
    Name = "${var.prefix}-sg-1"
  }
}

# EC2 설정 시작

# EC2 역할 생성
resource "aws_iam_role" "ec2_role_1" {
  name = "${var.prefix}-ec2-role-1"

  # 이 역할에 대한 신뢰 정책 설정. EC2 서비스가 이 역할을 가정할 수 있도록 설정
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Effect = "Allow"
      }
    ]
  })
}

# EC2 역할에 AmazonS3FullAccess 정책을 부착
resource "aws_iam_role_policy_attachment" "s3_full_access" {
  role       = aws_iam_role.ec2_role_1.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3FullAccess"
}

# EC2 역할에 최신 SSM 정책을 부착
resource "aws_iam_role_policy_attachment" "ec2_ssm" {
  role       = aws_iam_role.ec2_role_1.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# IAM 인스턴스 프로파일 생성
resource "aws_iam_instance_profile" "instance_profile_1" {
  name = "${var.prefix}-instance-profile-1"
  role = aws_iam_role.ec2_role_1.name
}

# 최신 Amazon Linux AMI 조회
data "aws_ssm_parameter" "amazon_linux_ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

# EC2 부트스트랩 스크립트 정의
locals {

  ec2_bootstrap = <<-EOF
#!/bin/bash
set -euxo pipefail

LOG_FILE="/var/log/bootstrap.log"
exec > >(tee -a $LOG_FILE) 2>&1

echo "BOOTSTRAP START"

# 타임존 설정
timedatectl set-timezone Asia/Seoul

# GIT, 도커 설치
dnf update -y
dnf install -y git docker

# 시스템 재부팅시 자동으로 도커 서비스 시작되도록 설정
systemctl enable docker
# 도커 서비스 시작
systemctl start docker

# swap 4GB 생성
dd if=/dev/zero of=/swapfile bs=128M count=32
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
sh -c 'echo "/swapfile swap swap defaults 0 0" >> /etc/fstab'
echo 'vm.swappiness = 10' >> /etc/sysctl.conf
sysctl -p

# 환경변수 세팅(/etc/environment)
echo 'PASSWORD_1=${var.password_1}' >> /etc/environment
echo 'APP_1_DOMAIN=${var.app_1_domain}' >> /etc/environment
echo 'APP_1_DB_NAME=${var.app_1_db_name}' >> /etc/environment
echo 'GITHUB_ACCESS_TOKEN_1_OWNER=${var.github_access_token_1_owner}' >> /etc/environment
echo 'GITHUB_ACCESS_TOKEN_1=${var.github_access_token_1}' >> /etc/environment
source /etc/environment

# 도커 네트워크 생성
docker network create common

# npmplus 설치
docker run -d \
  --name npm_1 \
  --restart unless-stopped \
  --network common \
  -p 80:80 \
  -p 443:443 \
  -p 443:443/udp \
  -p 81:81 \
  -e TZ=Asia/Seoul \
  -e 'INITIAL_ADMIN_EMAIL=admin@npm.com' \
  -e 'INITIAL_ADMIN_PASSWORD=${var.password_1}' \
  -v /dockerProjects/npm_1/volumes/data:/data \
  zoeyvid/npmplus:latest

# redis 설치
docker run -d \
  --name=redis_1 \
  --restart unless-stopped \
  --network common \
  -p 6379:6379 \
  -e TZ=Asia/Seoul \
  -v /dockerProjects/redis_1/volumes/data:/data \
  redis --requirepass '${var.password_1}' --maxmemory 50mb --maxmemory-policy allkeys-lru

# postgresql(pgj) 설치
docker run -d \
  --name pg_1 \
  --restart unless-stopped \
  -v /dockerProjects/pg_1/volumes/var/lib/postgresql:/var/lib/postgresql \
  --network common \
  -p 5432:5432 \
  -e 'POSTGRES_USER=postgres' \
  -e 'POSTGRES_PASSWORD=${var.password_1}' \
  -e 'POSTGRES_DATABASE=postgres' \
  -e 'POSTGRES_DATABASES=${var.app_1_db_name}' \
  -e 'TZ=Asia/Seoul' \
  jangka512/pgj:latest

echo '${var.github_access_token_1}' | docker login ghcr.io -u '${var.github_access_token_1_owner}' --password-stdin

echo "BOOTSTRAP DONE"
EOF
}

# EC2 인스턴스 생성
resource "aws_instance" "ec2_1" {
  # 사용할 AMI ID
  ami = data.aws_ssm_parameter.amazon_linux_ami.value
  # EC2 인스턴스 유형
  instance_type = "t3.micro"
  # 사용할 서브넷 ID
  subnet_id = aws_subnet.subnet_2.id
  # 적용할 보안 그룹 ID
  vpc_security_group_ids = [aws_security_group.sg_1.id]
  # 퍼블릭 IP 연결 설정
  associate_public_ip_address = true

  # 인스턴스에 IAM 역할 연결
  iam_instance_profile = aws_iam_instance_profile.instance_profile_1.name

  # 루트 볼륨 설정
  root_block_device {
    volume_type = "gp3"
    volume_size = 30
  }

  user_data = <<-EOF
${local.ec2_bootstrap}
hostnamectl set-hostname ec2-1
EOF

  # 인스턴스에 태그 설정
  tags = {
    Name = "${var.prefix}-ec2-1"
  }
}
