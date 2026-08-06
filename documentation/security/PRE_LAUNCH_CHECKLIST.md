# Pre-Launch Security Checklist

⚠️ **CRITICAL: Complete these items before public launch**

## 🔴 HIGH PRIORITY - MUST DO BEFORE PUBLIC LAUNCH

### 1. Regenerate API Wallet Mnemonic
**Status:** ✅ DONE — rotated 27 February 2026  
**Risk Level:** resolved  

The development mnemonic was previously printed in this file and in five other
documents, all of which are public. It has been rotated and scrubbed.

**Verification** (any of these can be re-run at any time):

| | |
| --- | --- |
| Live `api-wallet` | `daon1l3lrs7u3wszkuu83gaklwyv26233tmnk3u77pd` |
| Retired, exposed wallet | `daon1sjprvykgf0yj59f4nzjpwjyekj85a6gtl3qx3n` |

The retired wallet holds a zero balance, appears nowhere in `genesis.json`, and has no
role on the chain. The `API_MNEMONIC` GitHub secret was reset on 2026-02-27.

```bash
# live address — must NOT be the retired one above
docker exec daon-blockchain daond keys show api-wallet -a \
  --keyring-backend test --home /daon/.daon

# retired wallet should report an empty balance
docker exec daon-blockchain daond query bank balances \
  daon1sjprvykgf0yj59f4nzjpwjyekj85a6gtl3qx3n --output json
```

**Do not paste a mnemonic into this file to document a mnemonic problem.** It lives in the
`API_MNEMONIC` GitHub secret and the server environment, nowhere else.

**If rotation is ever needed again:**
1. Generate new secure mnemonic with proper entropy
2. Fund the new wallet with sufficient tokens for operations
3. Update GitHub Secret: `API_MNEMONIC`
4. Redeploy all services
5. Securely backup the new mnemonic (encrypted, offline storage)
6. Destroy all copies of the old mnemonic

**Commands:**
```bash
# Generate new mnemonic (run locally, not on server)
daond keys add api-wallet-new --keyring-backend test

# This will output a 24-word mnemonic - SAVE IT SECURELY!
# Then update GitHub secret:
gh secret set API_MNEMONIC -b"<NEW_MNEMONIC_HERE>"

# Trigger redeployment
git commit --allow-empty -m "chore: trigger redeployment with new wallet"
git push origin main
```

### 2. Rotate All Production Secrets
**Status:** ❌ NOT DONE  
**Risk Level:** HIGH

Secrets to rotate:
- [ ] `POSTGRES_PASSWORD` - Database password
- [ ] `API_KEY_SECRET` - API key signing secret
- [ ] `API_MNEMONIC` - Blockchain wallet (see above)
- [ ] `SERVER_SSH_KEY` - Deployment SSH key

### 3. Enable Production Security Features
**Status:** ❌ NOT DONE  
**Risk Level:** MEDIUM

- [ ] Enable rate limiting (currently disabled in test mode)
- [ ] Configure CORS for production domains only
- [ ] Enable request logging and monitoring
- [ ] Set up intrusion detection
- [ ] Configure firewall rules (block all except 80, 443, 22)

### 4. Blockchain Security
**Status:** ❌ NOT DONE  
**Risk Level:** HIGH

- [ ] Ensure validator key is properly secured
- [ ] Backup validator private key to secure offline storage
- [ ] Set up validator monitoring and alerting
- [ ] Configure stake/bond amounts appropriately
- [ ] Set minimum gas prices for spam prevention

### 5. Infrastructure Hardening
**Status:** ❌ NOT DONE  
**Risk Level:** MEDIUM

- [ ] SSH: Disable password auth, key-only
- [ ] SSH: Change default port from 22
- [ ] Set up fail2ban for SSH brute force protection
- [ ] Configure automatic security updates
- [ ] Set up log rotation and retention policies
- [ ] Enable audit logging

## 🟡 MEDIUM PRIORITY - BEFORE PUBLIC LAUNCH

### 6. Monitoring & Alerting
- [ ] Set up uptime monitoring (UptimeRobot, Pingdom, etc.)
- [ ] Configure alerts for service failures
- [ ] Set up log aggregation (Papertrail, Loggly, etc.)
- [ ] Configure error tracking (Sentry, Rollbar, etc.)
- [ ] Set up blockchain metrics monitoring

### 7. Backup & Disaster Recovery
- [ ] Automated PostgreSQL backups (daily)
- [ ] Automated blockchain state backups
- [ ] Test backup restoration procedure
- [ ] Document disaster recovery runbook
- [ ] Set up off-site backup storage

### 8. Documentation
- [ ] Document all production credentials storage locations
- [ ] Create incident response playbook
- [ ] Document rollback procedures
- [ ] Create runbook for common operational tasks

## 🟢 NICE TO HAVE - CAN BE DONE AFTER LAUNCH

### 9. Advanced Security
- [ ] Set up Web Application Firewall (WAF)
- [ ] Configure DDoS protection (Cloudflare, etc.)
- [ ] Implement API request signing
- [ ] Set up security scanning (automated vulnerability scanning)
- [ ] Configure Content Security Policy headers

### 10. Compliance & Legal
- [ ] Privacy policy published
- [ ] Terms of service published
- [ ] GDPR compliance review (if applicable)
- [ ] Security audit by third party
- [ ] Penetration testing

## Timeline Recommendation

**Minimum 1 week before public announcement:**
1. Complete all HIGH PRIORITY items
2. Test all security measures
3. Verify backups are working
4. Run security scan

**Day before launch:**
1. Final security review
2. Verify all secrets are production-ready
3. Test disaster recovery procedures
4. Ensure monitoring is active

**Launch day:**
1. Monitor all systems closely
2. Have incident response team ready
3. Watch for unusual activity

## Notes

- This checklist was created on: 2025-11-21
- Last updated: 2025-11-21
- Responsible: TBD
- Target launch date: TBD

**Remember: Security is not a one-time task. Regular reviews and updates are essential.**
