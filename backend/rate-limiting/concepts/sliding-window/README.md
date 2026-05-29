# 🌊 Sliding Window Rate Limiting

### 💡 Plain English Explanation
Instead of resetting a counter at static intervals (like 1:00, 2:00), the sliding window looks at a **rolling timeline**. Whenever a request arrives, the system looks exactly 1 minute *backward* from that exact millisecond. If the total number of requests found in that trailing timeline is below the limit, the request is allowed.

### 📊 Visualizing the Rolling Window

```text
Limit: 3 requests per rolling 10-second window.
Current time (Now): t = 17s

Timeline:
 t=0    t=2    t=5    t=8         t=13    t=16   t=17(Now)     t=20
─┼──────┼──────┼──────┼───────────┼───────┼───────┼────────────┼─
        R1     R2     R3          R4      R5      R6?
                      │           │       │       
                      └───────────┼───────┴───────┐
                                  │               │
                                  ▼               ▼
                        [ Rolling Window: t=7s to t=17s ]
                        
* Requests inside this window: R3 (8s) is OUTSIDE. Only R4 (13s) and R5 (16s) count.
* Current Count = 2. Limit is 3.
* Result: ✅ R6 is ALLOWED.
🏎️ Real-World Scenario
Rule: Max 3 requests per rolling 10 seconds.

The Outcome: If you try to spam 6 requests within 2 seconds at a window edge, the window slides with your requests. The 4th, 5th, and 6th requests are immediately blocked because your trailing 10-second view is completely full.

⚖️ Trade-offs
Pros: * Exceptionally accurate.

Completely eliminates the boundary burst problem.

Cons: * High memory overhead. You must save a unique timestamp for every single request a user makes inside a data structure like a Redis Sorted Set (ZSET).

🎯 Quick Interview Pitch
"Sliding window offers maximum accuracy by replacing fixed time slots with a dynamic rolling timeline. It perfectly mitigates edge bursts, but requires significantly more memory because it tracks individual timestamps rather than a simple counter."



Let's say your limit is 5 requests per 60 seconds.t = 10s to 50s: A user sends 5 requests. They are all allowed. The system logs these 5 timestamps.t = 65s: The user tries to send a 6th request.The system looks at the window from t = 5s to t = 65s.It checks if any logs are older than 5s. None are (they started at 10s).The count is still 5. The 6th request is blocked.t = 72s: The user sends another request.The new window is t = 12s to t = 72s.The system looks at the logs. The request from t = 10s is now older than 12s, so it gets evaporated/deleted from the history.The active count drops to 4. This new request is allowed!

⚖️ Trade-offs: Pros vs. ConsPros✅ Perfect Accuracy: It completely eliminates the boundary burst flaw. A user can never exceed the rate limit within any arbitrary 60-second window.✅ Smooth Flow: It offers a much fairer distribution of requests for the user, as the window resets gradually rather than all at once.Cons❌ Memory Intensive: This is the biggest drawback. Unlike Fixed Window (which only stores a single integer counter per user), Sliding Window stores every single request timestamp. If a popular API allows 10,000 requests per hour per user, you have to store 10,000 integers in memory for a active user.❌ Higher Performance Cost: Cleaning and counting elements in a sorted set takes $O(\log N)$ time complexity, which is heavier than a simple $O(1)$ integer increment.
