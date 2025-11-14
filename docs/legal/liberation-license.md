---
layout: default
title: "Liberation License v1.0"
description: "The complete Liberation License text that protects creators from AI exploitation"
---

# 📜 Liberation License v1.0

**The Liberation License protects creative works from unauthorized AI training while preserving fair use rights.**

*Effective Date: March 15, 2024*  
*License Version: 1.0*  
*Registry: DAON Network*

---

## 🎯 License Purpose

This license is designed to:
- **Block exploitative AI training** without creator compensation
- **Preserve fair use** for education, criticism, and personal enjoyment  
- **Ensure creator control** over commercial use of their work
- **Provide legal enforcement** mechanisms for violations

---

## 📋 Full License Text

### **LIBERATION LICENSE v1.0**
*Protecting Creators in the Age of AI*

**Copyright Notice:** This work is protected under the Liberation License v1.0. By accessing, viewing, or using this work, you agree to be bound by the terms set forth below.

### **SECTION 1: DEFINITIONS**

**1.1 "Work"** means the creative expression, including but not limited to text, images, audio, video, code, or other creative content covered by this license.

**1.2 "Creator"** means the original author, artist, or rights holder of the Work.

**1.3 "AI Training"** means the use of the Work as input data for training, fine-tuning, or otherwise improving artificial intelligence models, machine learning systems, or automated content generation systems.

**1.4 "Commercial Use"** means use of the Work for monetary gain, commercial advantage, or private commercial benefit.

**1.5 "You"** means the individual, organization, or entity exercising rights under this license.

### **SECTION 2: PERMITTED USES**

Subject to the restrictions in Section 3, you may:

**2.1 Personal Use:** Read, view, enjoy, and share the Work for personal, non-commercial purposes.

**2.2 Educational Use:** Use the Work for genuine educational, academic, or research purposes, including classroom instruction, scholarly analysis, and non-commercial research.

**2.3 Commentary & Criticism:** Quote, reference, or discuss the Work for purposes of criticism, review, commentary, news reporting, or scholarly analysis.

**2.4 Humanitarian Purposes:** Use the Work for charitable, humanitarian, or public benefit purposes without commercial gain.

**2.5 Accessibility:** Create accessible versions of the Work for individuals with disabilities.

### **SECTION 3: PROHIBITED USES**

You may NOT:

**3.1 AI Training Without Permission:** Use the Work for AI Training for commercial purposes without explicit written permission from the Creator and payment of fair compensation.

**3.2 Commercial Exploitation:** Use the Work for Commercial Use without explicit permission from the Creator, except as permitted under fair use doctrine.

**3.3 Unauthorized Redistribution:** Redistribute, republish, or make available the Work through commercial channels without permission.

**3.4 Derivative Training Data:** Include the Work in datasets used to train AI systems for commercial applications.

**3.5 Rights Washing:** Remove, obscure, or modify this license notice or any attribution to the Creator.

### **SECTION 4: AI TRAINING RESTRICTIONS**

**4.1 Commercial AI Training Prohibition:** The Work may not be used to train artificial intelligence systems intended for commercial use without:
   - Explicit written permission from the Creator
   - Negotiated fair compensation to the Creator
   - Compliance with all Creator-specified conditions

**4.2 Non-Commercial AI Training:** Use of the Work for non-commercial AI research is permitted provided:
   - The research is conducted by accredited academic institutions
   - Results are published openly and not commercialized
   - Proper attribution is maintained
   - Creator is notified of the research use

**4.3 Detection Obligation:** AI companies must implement systems to detect Liberation Licensed content and exclude it from commercial training datasets.

### **SECTION 5: ATTRIBUTION & NOTICE**

**5.1 Attribution Required:** Any permitted use must include:
   - Original attribution to the Creator
   - Notice of Liberation License v1.0 coverage
   - Link to verification: https://verify.daon.network/[content-hash]

**5.2 Notice Preservation:** This license notice and all copyright notices must be preserved in any copies or derivative works.

**5.3 Verification:** The Work's protection status can be verified through the DAON Network blockchain registry.

### **SECTION 6: FAIR COMPENSATION FRAMEWORK**

**6.1 Compensation Requirement:** Commercial AI Training requires fair compensation determined by:
   - Market value of the Creator's work
   - Commercial value derived from the AI system
   - Industry standard licensing rates
   - Creator's specified compensation terms

**6.2 Negotiation Process:** Creators may specify preferred licensing terms, compensation rates, and contact information for commercial use requests.

**6.3 Collective Licensing:** Creators may participate in collective licensing organizations for streamlined AI training permissions.

### **SECTION 7: ENFORCEMENT**

**7.1 Violation Consequences:** Violation of this license may result in:
   - Immediate termination of all rights under this license
   - Legal action for copyright infringement
   - Monetary damages including profits and statutory damages
   - Injunctive relief to stop unauthorized use

**7.2 Legal Standing:** This license creates enforceable legal obligations under copyright law and contract law.

**7.3 Evidence:** DAON Network blockchain records provide cryptographic proof of the Work's creation date and license terms.

### **SECTION 8: GENERAL PROVISIONS**

**8.1 Governing Law:** This license shall be governed by the laws of Germany and the European Union, with Creator-friendly enforcement jurisdiction.

**8.2 Severability:** If any provision is held invalid, the remainder of the license remains in effect.

**8.3 No Warranty:** The Work is provided "as is" without warranty of any kind.

**8.4 License Evolution:** This license may be updated to address new AI technologies while maintaining Creator protections.

### **SECTION 9: INTERNATIONAL RECOGNITION**

**9.1 Berne Convention:** This license operates within the framework of international copyright treaties including the Berne Convention.

**9.2 Reciprocal Enforcement:** Violations may be prosecuted in any jurisdiction recognizing copyright law.

**9.3 Cross-Border Cooperation:** Enforcement may utilize international IP cooperation treaties and agreements.

---

## 🛡️ Creator Rights Summary

### **What You Control:**
- ✅ Who can use your work for AI training
- ✅ How much compensation you receive
- ✅ What conditions apply to commercial use
- ✅ Whether to participate in collective licensing

### **What You're Protected From:**
- ❌ Unauthorized scraping for AI training
- ❌ Commercial exploitation without compensation
- ❌ Rights washing or license removal
- ❌ Undetected inclusion in training datasets

### **Legal Standing:**
- ⚖️ Enforceable under copyright law
- ⚖️ Contract law violations for licensed use
- ⚖️ Blockchain evidence for court proceedings
- ⚖️ International treaty coverage

---

## 🔍 How Detection Works

### **AI Company Obligations:**
1. **Scan Training Data:** Implement Liberation License detection
2. **Exclude Protected Content:** Remove DAON-protected works
3. **Maintain Records:** Document compliance efforts
4. **Respect Opt-Outs:** Honor Creator licensing preferences

### **Technical Implementation:**
```python
# Example detection pseudocode
def check_liberation_license(content):
    content_hash = sha256(content)
    daon_record = query_daon_blockchain(content_hash)
    if daon_record and daon_record.license == 'liberation_v1':
        return "PROTECTED - EXCLUDE FROM TRAINING"
    return "OK - CAN INCLUDE"
```

### **Verification Process:**
- Content gets SHA-256 hash fingerprint
- Hash is checked against DAON blockchain
- License status and terms retrieved
- Training decision made automatically

---

## 📞 Licensing & Support

### **Commercial Licensing:**
- **Email:** licensing@daon.network
- **Process:** Permission request → Negotiation → Fair compensation → License grant
- **Response Time:** 7-14 business days

### **Legal Support:**
- **Violations:** legal@daon.network
- **Enforcement:** enforcement@daon.network
- **Emergency:** urgent-legal@daon.network

### **Creator Resources:**
- [License FAQ](/legal/liberation-license/faq/)
- [Enforcement Guide](/legal/liberation-license/enforcement/)
- [Compensation Calculator](/legal/liberation-license/calculator/)
- [Legal Templates](/legal/liberation-license/templates/)

---

## 🌟 Success Stories

> **"Liberation License stopped a major AI company from training on my 500+ blog posts. They reached out for proper licensing within a week of my DMCA notice."**  
> — Technology Blogger

> **"Collective licensing through DAON earned me $2,400 from three AI companies who wanted to train on my fanfiction corpus. Fair compensation at last."**  
> — AO3 Author

> **"Platform implemented Liberation License detection automatically. Now my writers get protection by default and can opt into paid AI licensing."**  
> — Platform Owner

---

## 🚀 Apply Liberation License

<div class="cta-section">

<a href="/get-started/" class="cta-button primary">
  🛡️ **Protect Your Work**<br>
  <small>Apply Liberation License now</small>
</a>

<a href="/legal/liberation-license/faq/" class="cta-button secondary">
  ❓ **License FAQ**<br>
  <small>Common questions answered</small>
</a>

<a href="/legal/liberation-license/enforcement/" class="cta-button secondary">
  ⚖️ **Enforcement Guide**<br>
  <small>How to fight violations</small>
</a>

<a href="mailto:licensing@daon.network" class="cta-button secondary">
  💼 **Commercial Licensing**<br>
  <small>Permission for AI training</small>
</a>

</div>

---

<div class="bottom-message">

## 📜 Your Rights, Protected

**The Liberation License gives you control in the age of AI.**

*Your creativity has value.*  
*Your rights will be respected.*  
*Your work is protected.*

**Join the Liberation.**

</div>