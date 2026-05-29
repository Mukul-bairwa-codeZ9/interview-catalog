# 💧 Leaky Bucket Rate Limiting

### 💡 Plain English Explanation
Picture a kitchen funnel. You can dump a cup of water into the funnel all at once (burst inputs), but the water drips out of the small bottom hole at a **perfectly steady, unyielding rate**. 
* If you pour too much water too quickly, the funnel overflows. 
* In software, the funnel capacity is a Request Queue (First-In-First-Out), and the steady drips represent processed backend requests.

### 📊 Visualizing Traffic Smoothing

```text
    💥 BURST INPUT (Client requests arrive all at once)
      R1  R2  R3  R4  R5  R6  R7
      │   │   │   │   │   │   │
      ▼   ▼   ▼   ▼   ▼   ▼   ▼
    ┌───────────────────────────┐
    │ 📥 [R4]  [R3]  [R2]  [R1] │ <- FIFO Queue (Max Capacity: 4)
    └──────────────┬────────────┘
                   │ 
                   └── 🚫 R5, R6, R7 OVERFLOW & GET DROPPED!
                   │
                   ▼ (Constant Leaking / Processing Rate)
               ⚙️ [R1] (Processed at t = 100ms)
               ⚙️ [R2] (Processed at t = 200ms)
               ⚙️ [R3] (Processed at t = 300ms)
🏎️ Real-World Scenario
Rule: Queue capacity = 4 requests. Leak rate = 1 request per 100ms.

The Outcome: A script hits your endpoint with 7 simultaneous operations. The first 4 fill up the buffer queue. The remaining 3 overflow and are instantly rejected with a 429 Too Many Requests error. The backend processes the 4 accepted requests exactly 100ms apart, safeguarding your system from sudden spikes.

⚖️ Trade-offs
Pros: * Guarantees a completely smooth, predictable load on downstream dependencies. Excellent for database operations or high-throughput data streams.

Cons: * Introduces network latency for legitimate users because requests are forced to wait in a queue rather than executing instantly.

🎯 Quick Interview Pitch
"Leaky bucket enforces a smooth, constant output rate regardless of traffic volatility. While token bucket allows bursts to execute immediately, leaky bucket handles bursts by queueing them, ensuring your backend is completely insulated from sudden traffic spikes."









The Leaky Bucket algorithm processes traffic smoothly by passing requests through a centralized queue. Imagine a bucket with a small hole at the bottom: no matter how fast you pour water into the top of the bucket, it leaks out of the bottom at a constant, predictable rate.

The Input (Buffer/Queue): When a user sends requests, they enter a First-In, First-Out (FIFO) queue. If the queue is completely full, any new incoming requests spill over the edge and are dropped immediately (returning an HTTP 429 Too Many Requests).

The Output (Processing): A background worker or system clock pulls requests from the bottom of the queue and processes them at a strict, unyielding pace.

📊 Concrete Example
Let's configure a leaky bucket with these parameters:

Bucket Capacity (Queue Size): 3 slots

Leak Rate (Processing Speed): 1 request every 20 seconds

Here is how the system handles a sudden surge of traffic:

t = 0s: A massive burst of 5 requests arrives simultaneously.

Request 1, 2, and 3 fill up the 3 slots in the queue.

Request 4 and 5 find the queue full and are dropped immediately.

t = 0s: Request 1 (at the front of the queue) leaks out and is processed. There are now 2 requests left waiting in the bucket.

t = 20s: The clock ticks. Request 2 leaks out and is processed. Only 1 request remains in the bucket.

t = 25s: The user sends another request (Request 6). Because there are empty slots in the queue, Request 6 is successfully appended to the back of the line.

t = 40s: The clock ticks. Request 3 leaks out and is processed.