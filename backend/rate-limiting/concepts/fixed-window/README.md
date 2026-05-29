# 🪟 Fixed Window Rate Limiting

### 💡 Plain English Explanation
Imagine a subway turnstile that resets its counter exactly at the start of every hour. It allows a maximum of **100 people per hour**. 
* From 1:00 PM to 2:00 PM, it counts up to 100. Person 101 is instantly blocked.
* At exactly 2:00 PM, the counter drops back to 0, completely erasing the memory of the previous hour.

### 📊 Visualizing the "Boundary Burst" Flaw

```text
Limit: 3 requests per 10-second window.


Window 1 (0s - 10s)          Window 2 (10s - 20s)          Window 3 (20s - 30s)
[  R1   R2   R3  ]          [  R4   R5   R6  ]          [  R7   R8   ..  ]
 0s           10s            10s          20s            20s          30s
               ▲              ▲            ▲
               │              │            │
               └──────┬───────┘            └─ Counter resets to 0
                      │
            ⚠️ BOUNDARY BURST! ⚠️
       6 requests processed within a 
       2-second span (t=9s to t=11s).
       This doubles our intended limit!



🏎️ Real-World Scenario
Rule: Max 5 requests per minute.

The Exploit: A user sends 5 requests at 11:59:59 AM (allowed) and 5 more requests at 12:00:01 PM (allowed). The system just processed 10 requests in a 2-second span, which can easily crash a fragile downstream microservice.

⚖️ Trade-offs
Pros: * Extremely easy to implement.

Low memory footprint (only stores a single integer counter and an expiration timestamp per user ID).

Cons: * Unstable security due to traffic bursts at window boundaries.

🎯 Quick Interview Pitch
"Fixed window is perfect for simple applications or managing daily usage quotas where edge bursts don't threaten system stability. However, it shouldn't be used for strict security or high-frequency resource protection due to the boundary burst flaw."




