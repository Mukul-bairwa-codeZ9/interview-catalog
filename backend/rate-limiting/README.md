# Backend > Rate Limiting Structure

```txt
backend/
└── rate-limiting/
    ├── README.md
    │
    ├── concepts/
    │   ├── fixed-window/
    │   │   ├── notes.md
    │   │   ├── explanation.md
    │   │   ├── advantages.md
    │   │   ├── disadvantages.md
    │   │   └── diagrams.md
    │   │
    │   ├── sliding-window/
    │   │   ├── notes.md
    │   │   ├── explanation.md
    │   │   ├── dry-run.md
    │   │   ├── complexity.md
    │   │   └── diagrams.md
    │   │
    │   ├── token-bucket/
    │   │   ├── notes.md
    │   │   ├── explanation.md
    │   │   ├── real-world-usage.md
    │   │   └── diagrams.md
    │   │
    │   └── leaky-bucket/
    │       ├── notes.md
    │       ├── explanation.md
    │       └── diagrams.md
    │
    ├── implementations/
    │   ├── custom-rate-limiter/
    │   │   ├── README.md
    │   │   ├── code.js
    │   │   ├── code.ts
    │   │   ├── explanation.md
    │   │   ├── dry-run.md
    │   │   ├── complexity.md
    │   │   ├── edge-cases.md
    │   │   └── follow-up-questions.md
    │   │
    │   ├── express-rate-limit/
    │   │   ├── setup.md
    │   │   ├── code.js
    │   │   ├── advanced-config.md
    │   │   └── production-notes.md
    │   │
    │   ├── redis-rate-limiter/
    │   │   ├── architecture.md
    │   │   ├── code.js
    │   │   ├── distributed-flow.md
    │   │   └── scaling.md
    │   │
    │   └── distributed-rate-limiter/
    │       ├── architecture.md
    │       ├── redis-cluster.md
    │       ├── api-gateway.md
    │       └── scaling.md
    │
    ├── interview-questions/
    │   ├── beginner.md
    │   ├── intermediate.md
    │   ├── advanced.md
    │   └── senior-engineer.md
    │
    ├── system-design/
    │   ├── api-gateway-rate-limiting.md
    │   ├── cloudflare-architecture.md
    │   ├── nginx-rate-limiting.md
    │   └── distributed-systems.md
    │
    ├── resources/
    │   ├── articles.md
    │   ├── references.md
    │   ├── youtube-links.md
    │   └── research-papers.md
    │
    └── diagrams/
        ├── sliding-window.png
        ├── token-bucket.png
        ├── distributed-rate-limiter.png
        └── api-gateway-flow.png
```

---

# Why This Structure?

This structure separates:

* Concepts
* Implementations
* Interview preparation
* System design
* Resources
* Architecture diagrams

This makes the repository:

* scalable
* modular
* contributor-friendly
* production-grade
* easier for revisions

---

# Recommended Learning Flow

```txt
1. concepts/
2. implementations/
3. interview-questions/
4. system-design/
5. distributed architectures
```

---

# README.md

```md
# Custom Rate Limiter

## Overview

A rate limiter controls how many requests a client can make to an API within a fixed time period.

It helps:

- Prevent brute-force attacks
- Protect APIs from abuse
- Reduce server overload
- Handle traffic spikes
- Improve API stability

---

# Types of Rate Limiting

1. Fixed Window
2. Sliding Window
3. Token Bucket
4. Leaky Bucket

---

# Learning Goals

- Understand rate limiting architecture
- Build a custom rate limiter in Node.js
- Learn sliding window algorithm
- Understand Redis-based distributed rate limiting
- Learn production scalability concepts
```

---

# notes.md

```md
# Notes

## Definition

Rate limiting restricts the number of API requests a user/client can make within a defined time window.

---

# Why Rate Limiting?

- Security
- DDoS prevention
- Prevent brute force attacks
- Protect backend resources
- Maintain API stability

---

# Common Identification Keys

- IP Address
- User ID
- API Key
- Session ID

---

# Common Algorithms

## 1. Fixed Window

Simple counter-based approach.

Problem:
Burst traffic at window boundaries.

---

## 2. Sliding Window

Stores timestamps and removes expired requests.

More accurate.

---

## 3. Token Bucket

Tokens refill over time.

Supports burst traffic.

Used in:
- AWS
- NGINX
- Cloudflare

---

## 4. Leaky Bucket

Processes requests at a constant rate.

Good for traffic smoothing.

---

# Production Considerations

- Redis for distributed systems
- Horizontal scaling
- Retry-After headers
- Route-specific limits
- User-specific throttling
- API Gateway integration
```

---

# explanation.md

```md
# Detailed Explanation

## What is Rate Limiting?

Rate limiting is a backend protection mechanism used to control request flow.

Example:

5 requests per 10 seconds.

If the client exceeds this limit:

HTTP 429 -> Too Many Requests

---

# Sliding Window Algorithm

## Internal Working

Each request stores a timestamp.

Example:

[
  1715160000,
  1715160002,
  1715160004
]

On every request:

1. Remove expired timestamps
2. Count active requests
3. Block if limit exceeded
4. Store current request timestamp

---

# Why Sliding Window?

More accurate than fixed window.

Avoids sudden traffic bursts.

---

# Real-World Example

## Login API

Limit:

5 login attempts per minute.

Protects against:

- brute-force attacks
- credential stuffing

---

# Distributed Rate Limiting

Single server memory-based rate limiting does not work in distributed systems.

Solution:

Use Redis.

Architecture:

Client
  ↓
Load Balancer
  ↓
Multiple Node.js Servers
  ↓
Shared Redis Store

Redis maintains shared counters across all instances.
```

---

# code.js

```js
const express = require("express");

const app = express();

const requestStore = {};

function customRateLimiter(options) {
  const {
    windowSizeInSeconds,
    maxRequests,
  } = options;

  return function (req, res, next) {
    const ip = req.ip;

    const currentTime = Date.now();

    const windowSize = windowSizeInSeconds * 1000;

    if (!requestStore[ip]) {
      requestStore[ip] = [];
    }

    // Remove expired timestamps
    requestStore[ip] = requestStore[ip].filter((timestamp) => {
      return currentTime - timestamp < windowSize;
    });

    // Check request count
    if (requestStore[ip].length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: "Too many requests",
      });
    }

    // Store current request timestamp
    requestStore[ip].push(currentTime);

    next();
  };
}

app.use(
  customRateLimiter({
    windowSizeInSeconds: 10,
    maxRequests: 5,
  })
);

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "API working",
  });
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
```

---

# code.ts

```ts
import express, {
  Request,
  Response,
  NextFunction,
} from "express";

const app = express();

interface RequestStore {
  [key: string]: number[];
}

const requestStore: RequestStore = {};

interface RateLimiterOptions {
  windowSizeInSeconds: number;
  maxRequests: number;
}

function customRateLimiter(
  options: RateLimiterOptions
) {
  const {
    windowSizeInSeconds,
    maxRequests,
  } = options;

  return function (
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    const ip = req.ip || "unknown-ip";

    const currentTime = Date.now();

    const windowSize =
      windowSizeInSeconds * 1000;

    if (!requestStore[ip]) {
      requestStore[ip] = [];
    }

    requestStore[ip] = requestStore[ip].filter(
      (timestamp) => {
        return currentTime - timestamp < windowSize;
      }
    );

    if (requestStore[ip].length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: "Too many requests",
      });
    }

    requestStore[ip].push(currentTime);

    next();
  };
}

app.use(
  customRateLimiter({
    windowSizeInSeconds: 10,
    maxRequests: 5,
  })
);

app.get("/", (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "API working",
  });
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
```

---

# dry-run.md

```md
# Dry Run

## Configuration

Limit:

5 requests per 10 seconds

---

# Request Flow

## Request 1

Store:

[1000]

Allowed

---

## Request 2

Store:

[1000, 2000]

Allowed

---

## Request 3

Store:

[1000, 2000, 3000]

Allowed

---

## Request 4

Store:

[1000, 2000, 3000, 4000]

Allowed

---

## Request 5

Store:

[1000, 2000, 3000, 4000, 5000]

Allowed

---

## Request 6

Request count exceeds limit.

Blocked:

HTTP 429

---

# After 10 Seconds

Old timestamps removed.

Requests allowed again.
```

---

# complexity.md

```md
# Complexity Analysis

## Time Complexity

### Filtering timestamps

O(n)

Where:

n = requests inside active window.

---

## Space Complexity

O(n)

Stores timestamps for active requests.

---

# Optimization

Production systems optimize this using:

- Redis Sorted Sets
- Expiration TTL
- Sliding log optimization
- Token bucket algorithm
```

---

# edge-cases.md

```md
# Edge Cases

## 1. Memory Growth

Problem:

In-memory object grows indefinitely.

Solution:

Use Redis with expiration.

---

## 2. Server Restart

Problem:

All counters reset.

Solution:

Store data in Redis.

---

## 3. Multiple Servers

Problem:

Each server maintains separate counters.

Solution:

Use centralized Redis.

---

## 4. Proxy IP Issue

Problem:

req.ip may show proxy IP.

Solution:

Use:

app.set('trust proxy', true)

---

## 5. Burst Traffic

Problem:

Large traffic spikes.

Solution:

Use token bucket.
```

---

# follow-up-questions.md

```md
# Follow-Up Questions

## Beginner

- What is rate limiting?
- Why do we need rate limiting?
- What is HTTP 429?

---

## Intermediate

- Difference between fixed window and sliding window?
- Why is sliding window more accurate?
- Why use Redis?

---

## Advanced

- How would you scale this?
- How would rate limiting work in microservices?
- How does Cloudflare implement rate limiting?
- How would you prevent Redis bottlenecks?
- How would you implement distributed rate limiting?
- How would you rate limit WebSockets?
```

---

# diagrams.md

```md
# Architecture Diagram

## Basic Flow

Client
  ↓
Express Middleware
  ↓
Rate Limiter
  ↓
API Route

---

# Distributed Architecture

             ┌───────────────┐
             │ Load Balancer │
             └───────┬───────┘
                     ↓
      ┌──────────────┼──────────────┐
      ↓              ↓              ↓
┌──────────┐   ┌──────────┐   ┌──────────┐
│ Node API │   │ Node API │   │ Node API │
└────┬─────┘   └────┬─────┘   └────┬─────┘
     │              │              │
     └──────────────┼──────────────┘
                    ↓
             ┌────────────┐
             │   Redis    │
             └────────────┘

---

# Sliding Window Visualization

Time Window: 10 sec

Request Timeline:

1s → Request
2s → Request
3s → Request
4s → Request
5s → Request

6th request blocked.

After 11s:

1s request expires.

New request allowed.
```
