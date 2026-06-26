# Redis Pub/Sub Model

## What is Pub/Sub?

Pub/Sub stands for **Publish / Subscribe**. It is a messaging pattern where:

- A **Publisher** sends a message to a **Channel** — it does NOT know who is listening.
- A **Subscriber** listens to a Channel — it does NOT know who is sending.
- **Redis** sits in the middle and delivers the message from publisher to all active subscribers.

This decouples the sender and receiver completely. They never talk to each other directly.

```
Publisher  →  [Redis Channel: "notifications"]  →  Subscriber A
                                                 →  Subscriber B
                                                 →  Subscriber C
```

---

## Why Redis for Pub/Sub?

- **In-memory speed** — message delivery is near-instant, no disk I/O
- **Zero setup overhead** — no need to declare queues or topics upfront; channels are created on first use
- **Built-in commands** — PUBLISH, SUBSCRIBE, PSUBSCRIBE are native Redis commands
- **Fan-out by default** — one published message reaches ALL active subscribers automatically
- **Lightweight** — perfect for real-time signals where you don't need persistence

---

## How It Works

### Step 1 — Subscriber connects and listens

```bash
# In terminal / Redis client
SUBSCRIBE notifications
```

The subscriber is now blocked, waiting for messages on the `notifications` channel.

### Step 2 — Publisher sends a message

```bash
# In a separate terminal
PUBLISH notifications "user:123 just liked your post"
```

Redis immediately fans this message out to every active subscriber on `notifications`.

### Step 3 — Subscriber receives it

```
1) "message"
2) "notifications"
3) "user:123 just liked your post"
```

---

## Key Redis Commands

| Command | What it does |
|---|---|
| `SUBSCRIBE channel` | Listen to one specific channel |
| `PSUBSCRIBE pattern` | Listen to channels matching a pattern (e.g. `user:*`) |
| `PUBLISH channel message` | Send a message to all subscribers of a channel |
| `UNSUBSCRIBE channel` | Stop listening to a channel |
| `PUBSUB CHANNELS` | List all active channels with at least one subscriber |
| `PUBSUB NUMSUB channel` | See how many subscribers a channel has |

---

## Key Characteristics — The Gotchas Interviewers Love

### 1. Fire and Forget
Redis does NOT store the message anywhere. If no subscriber is listening at the moment of publish, **the message is lost forever**. There is no queue, no retry, no history.

### 2. No Message Persistence
Unlike Kafka or Redis Streams, Pub/Sub has zero durability. Redis does not write messages to disk. A subscriber that connects *after* a message was published will never see that message.

### 3. No Consumer Groups
Every subscriber gets every message. You cannot have two workers compete for the same message (like you can in BullMQ or Kafka consumer groups). All subscribers receive the full fan-out.

### 4. A Subscriber Cannot Do Other Things
Once a Redis client runs `SUBSCRIBE`, it enters a special mode. That connection can only receive messages — it cannot run GET, SET, or any other Redis commands. You need a separate Redis connection for normal operations.

### 5. No Acknowledgement
Redis does not know or care if the subscriber processed the message successfully. There is no ACK mechanism.

---

## Pub/Sub vs Streams vs Message Queues

This is a very common interview comparison question.

| Feature | Redis Pub/Sub | Redis Streams | BullMQ / Kafka |
|---|---|---|---|
| Message persistence | ❌ No | ✅ Yes | ✅ Yes |
| Replay old messages | ❌ No | ✅ Yes | ✅ Yes |
| Consumer groups | ❌ No | ✅ Yes | ✅ Yes |
| Fan-out to all | ✅ Yes | ⚠️ Needs config | ❌ One consumer gets it |
| Speed | ⚡ Fastest | Fast | Moderate |
| Use case | Real-time signals | Event sourcing, audit logs | Job queues, task processing |

**Simple rule:**
- Need speed + fan-out + don't care about lost messages → **Pub/Sub**
- Need persistence + replay → **Redis Streams**
- Need job retries + worker queues → **BullMQ / Kafka**

---

## Real-World Use Cases

### 1. Live Notifications
When a user likes a post, publish an event to `user:456:notifications`. All active browser connections subscribed to that channel receive it instantly.

### 2. Cache Invalidation Broadcast
You have 5 Node.js servers, each with a local in-memory cache. When data changes in the database, one server publishes to `cache:invalidate`. All 5 servers receive it and clear their local cache simultaneously.

### 3. Chat / Messaging Systems
Each chat room maps to a Redis channel. When a user sends a message, it is published to `room:789`. All users in that room receive it in real time.

### 4. Live Dashboards
A metrics service publishes CPU/memory stats every second to `metrics:server1`. A dashboard app subscribes and updates the UI in real time.

### 5. Event Broadcasting in Microservices
Service A completes an order and publishes to `orders:completed`. Service B (email), Service C (inventory), and Service D (analytics) all receive it independently.

---

## Interview Answer Template

**Q: Can you explain how Redis Pub/Sub works?**

> "Redis Pub/Sub is a messaging pattern where publishers send messages to a named channel, and all active subscribers on that channel receive those messages instantly. The key thing is that publishers and subscribers are completely decoupled — neither knows about the other. Redis acts as the broker in the middle.
>
> The important trade-off to understand is that Redis Pub/Sub is fire-and-forget. Messages are not stored anywhere. If a subscriber is offline when the message is published, it simply misses it. There's no replay, no persistence, no retry.
>
> This makes it ideal for real-time signals where speed matters more than guaranteed delivery — things like live notifications, cache invalidation broadcasts across multiple servers, or real-time dashboards.
>
> If you need persistence or guaranteed delivery, you'd reach for Redis Streams or something like BullMQ instead."

---

## Follow-Up Questions Interviewers Ask

**Q: What happens if a subscriber is down when a message is published?**
> The message is lost. Redis does not buffer or queue it. This is the core trade-off of Pub/Sub.

**Q: Can one Redis connection both subscribe and run normal commands?**
> No. Once you run SUBSCRIBE, that connection enters subscriber mode. You need a separate connection for regular Redis operations.

**Q: How would you use Pub/Sub for cache invalidation?**
> When data updates, publish to a channel like `cache:invalidate:users`. All application servers subscribed to that channel clear their local in-memory cache for that key immediately.

**Q: When would you NOT use Redis Pub/Sub?**
> When you need guaranteed delivery, message persistence, replay capability, or exactly-once processing. In those cases, use Redis Streams, BullMQ, or Kafka.

**Q: What is PSUBSCRIBE?**
> It's pattern-based subscribe. Instead of subscribing to one exact channel, you subscribe to a pattern like `user:*` and receive messages from all matching channels — `user:123`, `user:456`, etc.

---

## Related Concepts

- **Redis Streams** — Persistent, replayable event log in Redis. The durable alternative to Pub/Sub.
- **BullMQ** — Node.js job queue built on Redis. Supports retries, delays, priority queues.
- **Cache Invalidation** — Pub/Sub is commonly used to broadcast cache invalidation signals across distributed servers.
- **Event-Driven Architecture** — Pub/Sub is one implementation pattern within this broader design approach.
- **WebSockets** — Often paired with Redis Pub/Sub in Node.js apps; Pub/Sub handles the server-side fan-out, WebSockets handle the client delivery.