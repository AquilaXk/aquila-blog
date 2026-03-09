#!/usr/bin/env bash
set -euo pipefail

SSH_PORT="${1:-22}"
SSH_USER_NAME="${2:-$SUDO_USER}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo ./deploy/homeserver/hardening/setup_hardening.sh [ssh_port] [ssh_user]" >&2
  exit 1
fi

if [[ -z "${SSH_USER_NAME:-}" ]]; then
  echo "Could not determine SSH user. Pass second arg explicitly." >&2
  exit 1
fi

USER_HOME="$(getent passwd "${SSH_USER_NAME}" | cut -d: -f6)"
AUTHORIZED_KEYS="${USER_HOME}/.ssh/authorized_keys"

if [[ ! -s "${AUTHORIZED_KEYS}" ]]; then
  echo "No authorized_keys for ${SSH_USER_NAME} at ${AUTHORIZED_KEYS}. Abort to avoid lockout." >&2
  exit 1
fi

echo "[1/6] Install packages"
apt update
apt install -y ufw fail2ban

echo "[2/6] Configure sshd hardening"
install -d -m 755 /etc/ssh/sshd_config.d
sed "s/__SSH_PORT__/${SSH_PORT}/g" deploy/homeserver/hardening/sshd_config.d/99-hardening.conf > /etc/ssh/sshd_config.d/99-hardening.conf

# Explicitly restrict SSH login to deploy user
if ! grep -q '^AllowUsers ' /etc/ssh/sshd_config.d/99-hardening.conf; then
  echo "AllowUsers ${SSH_USER_NAME}" >> /etc/ssh/sshd_config.d/99-hardening.conf
fi

sshd -t
systemctl restart ssh

echo "[3/6] Configure UFW"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow "${SSH_PORT}/tcp"
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "[4/6] Configure fail2ban"
install -d -m 755 /etc/fail2ban/jail.d
sed "s/__SSH_PORT__/${SSH_PORT}/g" deploy/homeserver/hardening/fail2ban/jail.d/sshd.local > /etc/fail2ban/jail.d/sshd.local
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "[5/6] Status checks"
ss -tulpen | grep -E ":(${SSH_PORT}|80|443)\\b" || true
ufw status verbose
fail2ban-client status sshd || true

echo "[6/6] Done"
echo "If SSH port changed, update GitHub secret HOME_SSH_PORT=${SSH_PORT}."
