# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - img "DAON Logo" [ref=e7]
      - heading "Welcome to DAON" [level=1] [ref=e8]
      - paragraph [ref=e9]: Enter your email to receive a secure magic link
    - generic [ref=e10]:
      - img "Error" [ref=e11]
      - generic [ref=e15]:
        - heading "Error" [level=3] [ref=e16]
        - paragraph [ref=e17]: Network request failed. Please check your connection.
    - generic [ref=e18]:
      - generic [ref=e19]:
        - generic [ref=e20]: Email address
        - generic [ref=e21]:
          - generic:
            - img "Contact"
          - textbox "Email address" [ref=e22]:
            - /placeholder: you@example.com
            - text: errortest-1768260585890@example.com
      - button "Send Magic Link" [ref=e23]:
        - generic [ref=e24]:
          - generic [ref=e25]: Send Magic Link
          - img [ref=e26]
    - generic [ref=e29]:
      - img "Privacy and protection" [ref=e30]
      - generic [ref=e32]: Passwordless authentication • Privacy-first
  - button "Open Next.js Dev Tools" [ref=e38] [cursor=pointer]:
    - img [ref=e39]
  - alert [ref=e42]
```