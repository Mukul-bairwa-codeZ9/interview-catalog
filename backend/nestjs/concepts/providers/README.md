# NestJS Providers & Dependency Injection

## What is a Provider?

A **Provider** is anything that can be **injected** as a dependency.
The most common provider is a **Service**, but providers also include:
- Repositories
- Factories
- Helpers
- Custom values/tokens

The key idea: **you don't `new` your dependencies — NestJS creates and injects them for you.**

---

## What is Dependency Injection (DI)?

DI is a design pattern where a class receives its dependencies from the outside
rather than creating them internally.

```typescript
// ❌ Without DI — tightly coupled, hard to test
class TasksController {
  private service = new TasksService();  // controller creates its own dependency
}

// ✅ With DI — loosely coupled, easy to test/mock
class TasksController {
  constructor(private tasksService: TasksService) {}  // NestJS injects it
}
```

NestJS has a built-in **IoC container** (Inversion of Control) that manages
the creation and lifetime of all providers.

---

## Making a Provider

### Step 1: Mark the class as injectable
```typescript
import { Injectable } from '@nestjs/common';

@Injectable()              // tells NestJS: "this class can be injected"
export class TasksService {
  private tasks = [];

  findAll() { return this.tasks; }
  create(task) { this.tasks.push(task); return task; }
}
```

### Step 2: Register it in a module
```typescript
@Module({
  providers: [TasksService],   // NestJS now manages this service
  controllers: [TasksController],
})
export class TasksModule {}
```

### Step 3: Inject it into a controller or another service
```typescript
@Controller('tasks')
export class TasksController {
  constructor(private tasksService: TasksService) {}
  // NestJS reads the type (TasksService), finds it in the container, injects it
}
```

---

## Provider Lifetime (Scope)

By default, providers are **singletons** — one instance shared across the entire app.

| Scope | Behavior | Use case |
|---|---|---|
| `DEFAULT` (Singleton) | One instance for the whole app | Most services |
| `REQUEST` | New instance per HTTP request | Per-request state, tenant context |
| `TRANSIENT` | New instance every time it is injected | Stateless utilities |

```typescript
@Injectable({ scope: Scope.REQUEST })
export class TasksService {}
```

> **Interview note:** Singleton is almost always what you want.
> REQUEST scope cascades up — if a service is REQUEST scoped, every class that
> injects it also becomes REQUEST scoped.

---

## Custom Providers

NestJS supports several ways to define a provider beyond just `[TasksService]`.

### 1. useClass (default shorthand)
```typescript
// These two are equivalent:
providers: [TasksService]
providers: [{ provide: TasksService, useClass: TasksService }]
```

### 2. useValue — inject a constant
```typescript
providers: [
  {
    provide: 'APP_CONFIG',           // injection token (string)
    useValue: { port: 3000, env: 'production' },
  }
]

// Inject it using @Inject()
constructor(@Inject('APP_CONFIG') private config: AppConfig) {}
```

### 3. useFactory — computed/async provider
```typescript
providers: [
  {
    provide: 'DB_CONNECTION',
    useFactory: async (configService: ConfigService) => {
      return await createConnection(configService.get('DB_URL'));
    },
    inject: [ConfigService],         // factory dependencies
  }
]
```

### 4. useExisting — alias one provider to another
```typescript
providers: [
  LoggerService,
  { provide: 'ALIAS_LOGGER', useExisting: LoggerService }
  // both tokens point to the same instance
]
```

---

## Injection Tokens

When the token is a **class**, TypeScript's type system handles it:
```typescript
constructor(private tasksService: TasksService) {}
// NestJS sees the type is TasksService → looks it up in the container
```

When the token is a **string or Symbol**, use `@Inject()`:
```typescript
constructor(@Inject('APP_CONFIG') private config: AppConfig) {}
constructor(@Inject(CONFIG_TOKEN) private config: AppConfig) {}  // Symbol token
```

Using `Symbol` tokens is safer — string tokens can collide if you use the same name twice.

---

## Optional Dependencies

```typescript
constructor(
  @Optional() @Inject('CACHE_SERVICE') private cache?: CacheService
) {}
// If CacheService is not registered, NestJS won't throw — cache will be undefined
```

---

## Property Injection (rare)

```typescript
@Injectable()
export class TasksService {
  @Inject(ConfigService)
  private configService: ConfigService;
  // Avoid this — constructor injection is clearer and easier to test
}
```

---

## How the IoC Container Works

```
1. NestJS scans module metadata (providers array)
2. For each provider, reads its constructor parameter types (via TypeScript reflect-metadata)
3. Resolves the full dependency graph (handles circular deps, order)
4. Instantiates providers in dependency order
5. Injects instances into consumers

Example:
  TasksController needs TasksService
  TasksService needs DatabaseService
  → DatabaseService instantiated first
  → TasksService instantiated with DatabaseService
  → TasksController instantiated with TasksService
```

---

## Key Interview Points

- `@Injectable()` marks a class as a provider — required for DI to work
- NestJS providers are **singletons by default** — one instance per application
- Constructor injection is preferred over property injection
- Custom providers (`useValue`, `useFactory`, `useExisting`) give you full control
- String tokens need `@Inject('TOKEN')`, class tokens work automatically
- `Scope.REQUEST` creates a new instance per request — use only when truly needed
- The IoC container resolves the full dependency graph at startup — circular deps throw at boot time