# 🪣 Token Bucket Rate Limiting

### 💡 Plain English Explanation
Imagine a bucket that can hold a maximum of 5 physical tokens. Every second, a steady drip drops 1 new token into the bucket. If the bucket is already full, extra tokens spill over and disappear. 
* To make an API request, you must remove 1 token from the bucket.
* If the bucket is empty, your request is instantly rejected.

### 📊 Visualizing the Token Bucket Flow

```text
     (Refill Rate: 1 token/sec)
               💧
               ▼
       ┌───────────────┐
       │  🪙   🪙   🪙  │  <- Bucket Capacity: Max 5 tokens
       │    🪙   🪙    │  
       └───────┬───────┘
               │
               ▼ (Request arrives)
         [ 🪙 Cost: 1 ]
               │
       ┌───────┴───────┐
       │   ✅ ALLOWED  │ (If tokens available)
       └───────────────┘
       
* Note: If a user has been idle, the bucket fills up to 5 tokens. 
  They can instantly fire a burst of 5 requests at once!
🏎️ Real-World Scenario
Rule: Bucket capacity = 10 tokens. Refill rate = 2 tokens/sec.

The Outcome: A user leaves the app open but idle for an hour, filling their bucket to 10. They perform an action that triggers a sudden burst of 10 rapid API requests. The system handles it flawlessly. However, their bucket is now empty, meaning subsequent requests are limited to the steady refill rate of 2 per second.

⚖️ Trade-offs
Pros: * Highly memory efficient (only tracks two values: a token counter and a last-refill timestamp).

Gracefully permits controlled bursts of traffic so legitimate, fast UI interactions don't fail.

Cons: * Can be complex to coordinate in a highly distributed database architecture without encountering race conditions.

🎯 Quick Interview Pitch
"Token bucket is the industry standard for production REST APIs (used by AWS and Stripe). It balanced memory efficiency with consumer flexibility by allowing short, controlled traffic bursts while enforcing a strict long-term average rate."




The Token Bucket algorithm is one of the most widely used strategies for API rate limiting (utilized heavily by companies like Amazon Web Services, Stripe, and Shopify).

The core idea is simple: Imagine an actual bucket that holds "tokens." The bucket has a maximum capacity, and it constantly refills with tokens at a steady, predictable rate over time. Every time a user makes an API request, the system tries to draw a token out of the bucket.

If there is a token available: The request is allowed, one token is removed from the bucket, and processing continues.

If the bucket is empty: The request is rejected immediately (typically returning an HTTP 429 Too Many Requests), and no tokens are deducted.
