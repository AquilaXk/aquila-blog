# Home Server Hardening

## 대상

- Ubuntu 서버
- SSH 키 로그인 이미 정상 동작 중인 상태

## 적용 전 필수 확인

1. 현재 SSH 키 접속이 되는지 확인
2. 서버 콘솔(물리 접근 또는 원격 콘솔) 준비
3. GitHub `HOME_SSH_PORT` 변경 필요 여부 확인

## 실행

```bash
cd ~/app
sudo ./deploy/homeserver/hardening/setup_hardening.sh 22 <your_linux_user>
```

- 첫 번째 인자: SSH 포트 (기본 22)
- 두 번째 인자: SSH 로그인 사용자

## 적용 내용

- SSH: root 로그인 차단, 비밀번호 로그인 차단, 키 로그인만 허용
- SSH: `AllowUsers <your_linux_user>` 제한
- UFW: 인바운드 `SSH`, `80`, `443`만 허용
- fail2ban: sshd 브루트포스 차단

## 변경 파일(서버)

- `/etc/ssh/sshd_config.d/99-hardening.conf`
- `/etc/fail2ban/jail.d/sshd.local`

## 검증

```bash
sudo ufw status verbose
sudo fail2ban-client status sshd
sudo sshd -t
```

## 롤백

서버 콘솔에서:

```bash
sudo rm -f /etc/ssh/sshd_config.d/99-hardening.conf
sudo rm -f /etc/fail2ban/jail.d/sshd.local
sudo systemctl restart ssh
sudo systemctl restart fail2ban
sudo ufw --force disable
```
