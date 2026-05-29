# 🛡️ Rate Limiting Study Guide

Rate limiting is a defensive mechanism used to control the rate of incoming traffic to a network or API. It protects your server from being overwhelmed by too many requests (whether from malicious DDoS attacks, scraping, or just poorly optimized client code).

## 🚀 The 4 Core Algorithms At A Glance

| Algorithm | Burst Allowed | Memory Usage | Accuracy | Ideal Use Case |
| :--- | :---: | :---: | :---: | :--- |
| **Fixed Window** | ✅ Yes (Boundary exploit) | 📉 Low | 🛑 Low | Simple APIs, Tiered pricing limits |
| **Sliding Window** | ❌ No | 📊 Medium | 🎯 High | High-precision APIs |
| **Token Bucket** | ✅ Yes (Controlled) | 📉 Low | 📊 Medium | REST APIs needing burst handling (e.g., Stripe, AWS) |
| **Leaky Bucket** | ❌ No | 📊 Medium | 🎯 High | Network traffic shaping, Nginx-like smoothing |

---

## 📂 Folder Structure

```text
rate-limiting/
├── README.md                          <- You are here (Global Overview)
├── concepts/
│   ├── fixed-window/README.md         <- Concept + Diagram + Trade-offs
│   ├── sliding-window/README.md       <- Concept + Diagram + Trade-offs
│   ├── token-bucket/README.md         <- Concept + Diagram + Trade-offs
│   └── leaky-bucket/README.md         <- Concept + Diagram + Trade-offs
├── interview-questions/
│   ├── easy/README.md
│   ├── medium/README.md
│   └── advanced/README.md
└── implementations/
    └── rate-limiter(express)/