terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# VPC
resource "aws_vpc" "arbitrage_vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "arbitrage-vpc"
  }
}

# Internet Gateway
resource "aws_internet_gateway" "arbitrage_igw" {
  vpc_id = aws_vpc.arbitrage_vpc.id

  tags = {
    Name = "arbitrage-igw"
  }
}

# Public Subnet
resource "aws_subnet" "public_subnet" {
  vpc_id                  = aws_vpc.arbitrage_vpc.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = true

  tags = {
    Name = "arbitrage-public-subnet"
  }
}

# Private Subnet
resource "aws_subnet" "private_subnet" {
  vpc_id            = aws_vpc.arbitrage_vpc.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "${var.aws_region}b"

  tags = {
    Name = "arbitrage-private-subnet"
  }
}

# Route Table for Public Subnet
resource "aws_route_table" "public_rt" {
  vpc_id = aws_vpc.arbitrage_vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.arbitrage_igw.id
  }

  tags = {
    Name = "arbitrage-public-rt"
  }
}

# Route Table Association for Public Subnet
resource "aws_route_table_association" "public_rta" {
  subnet_id      = aws_subnet.public_subnet.id
  route_table_id = aws_route_table.public_rt.id
}

# Security Group for Arbitrage Bot
resource "aws_security_group" "arbitrage_sg" {
  name_prefix = "arbitrage-"
  vpc_id      = aws_vpc.arbitrage_vpc.id

  # SSH access
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTP access for monitoring
  ingress {
    from_port   = 3000
    to_port     = 3001
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Prometheus metrics
  ingress {
    from_port   = 9090
    to_port     = 9090
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # All outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "arbitrage-security-group"
  }
}

# IAM Role for EC2
resource "aws_iam_role" "arbitrage_role" {
  name = "arbitrage-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

# IAM Policy for secrets access
resource "aws_iam_policy" "arbitrage_policy" {
  name = "arbitrage-secrets-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "secretsmanager:GetSecretValue"
        ]
        Resource = "*"
      }
    ]
  })
}

# Attach policy to role
resource "aws_iam_role_policy_attachment" "arbitrage_policy_attachment" {
  role       = aws_iam_role.arbitrage_role.name
  policy_arn = aws_iam_policy.arbitrage_policy.arn
}

# Instance Profile
resource "aws_iam_instance_profile" "arbitrage_profile" {
  name = "arbitrage-instance-profile"
  role = aws_iam_role.arbitrage_role.name
}

# Key Pair
resource "aws_key_pair" "arbitrage_key" {
  key_name   = "arbitrage-key"
  public_key = file("~/.ssh/id_rsa.pub")
}

# EC2 Instance
resource "aws_instance" "arbitrage_instance" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.arbitrage_key.key_name
  vpc_security_group_ids = [aws_security_group.arbitrage_sg.id]
  subnet_id              = aws_subnet.public_subnet.id
  iam_instance_profile   = aws_iam_instance_profile.arbitrage_profile.name

  root_block_device {
    volume_type = "gp3"
    volume_size = 50
    encrypted   = true
  }

  user_data = base64encode(templatefile("${path.module}/user_data.sh", {
    docker_compose_file = file("${path.module}/docker-compose.yml")
  }))

  tags = {
    Name = "arbitrage-trading-bot"
  }
}

# Elastic IP
resource "aws_eip" "arbitrage_eip" {
  instance = aws_instance.arbitrage_instance.id
  domain   = "vpc"

  tags = {
    Name = "arbitrage-eip"
  }
}

# Data source for latest Amazon Linux 2 AMI
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }
}

