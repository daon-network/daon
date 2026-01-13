# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - img "DAON Logo" [ref=e7]
      - heading "Welcome to DAON" [level=1] [ref=e8]
      - paragraph [ref=e9]: Enter your email to receive a secure magic link
    - generic [ref=e10]:
      - generic [ref=e11]:
        - generic [ref=e12]: Email address
        - generic [ref=e13]:
          - generic:
            - img "Contact"
          - textbox "Email address" [active] [ref=e14]:
            - /placeholder: you@example.com
            - text: invalid-email
      - button "Send Magic Link" [ref=e15]:
        - generic [ref=e16]:
          - generic [ref=e17]: Send Magic Link
          - img [ref=e18]
    - generic [ref=e21]:
      - img "Privacy and protection" [ref=e22]
      - generic [ref=e24]: Passwordless authentication • Privacy-first
  - button "Open Next.js Dev Tools" [ref=e30] [cursor=pointer]:
    - img [ref=e31]
  - alert [ref=e34]
```