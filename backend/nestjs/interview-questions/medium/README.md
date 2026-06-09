# NestJS Interview Questions — Medium

---

## Q1. Explain the full NestJS request lifecycle in order.

**Answer:**
Every HTTP request goes through these layers in order:

1. **Middleware** — runs first, unconditionally. Express-compatible. Must call `next()` to continue. No access to handler metadata.
2. **Guards** — `canActivate()` returns true (allow) or false (403). Has access to `ExecutionContext` and handler metadata via `Reflector`.
3. **Interceptors (pre-handler)** — code before `next.handle()` is called. Can transform the request.
4. **Pipes** — validate and transform route params, query strings, and request body. Throw on invalid data.
5. **Route Handler** — your controller method executes.
6. **Interceptors (post-handler)** — code after `next.handle()` resolves. Can transform the response.
7. **Exception Filters** — catch any unhandled exception from any layer above. Format the error response.

Key insight: interceptors are the only layer that runs both before AND after the handler.

---

## Q2. What is the difference between a Guard and Middleware?

**Answer:**

| | Middleware | Guard |
|---|---|---|
| Runs | Before guards, first of all | After middleware |
| Can block? | Yes (don't call next) | Yes (return false → 403) |
| Handler metadata | ❌ No access | ✅ Yes (via Reflector) |
| DI support | Class-based only | Yes |
| Best for | Logging, body parsing | Auth, roles, permissions |

The critical difference: Guards can read custom metadata from decorators (like `@Roles('admin')`) using `Reflector`. Middleware cannot. So if you need role-based access control, you must use a Guard.

---

## Q3. How does `ExecutionContext` work and why is it useful?

**Answer:**
`ExecutionContext` extends `ArgumentsHost` and provides context-aware access to the current request/response, regardless of the transport layer (HTTP, WebSockets, microservices).

```typescript
// In a guard or interceptor:
canActivate(context: ExecutionContext): boolean {
  // Get HTTP request:
  const request = context.switchToHttp().getRequest();

  // Get the handler (controller method) being called:
  const handler = context.getHandler();

  // Get the class (controller):
  const controller = context.getClass();

  // Read metadata:
  const roles = this.reflector.get('roles', handler);
}
```

It's useful because the same guard/interceptor can work across HTTP, WebSocket, and gRPC contexts without rewriting logic.

---

## Q4. Explain custom providers. When would you use `useFactory`?

**Answer:**
Custom providers give you fine-grained control over how a provider is created.

`useFactory` is used when the provider needs to be created asynchronously or requires runtime computation:

```typescript
{
  provide: 'DATABASE_CONNECTION',
  useFactory: async (configService: ConfigService) => {
    return await createConnection({
      host: configService.get('DB_HOST'),
      port: configService.get('DB_PORT'),
    });
  },
  inject: [ConfigService],   // factory dependencies listed here
}
```

Use `useFactory` when:
- The provider depends on async operations (DB connection, HTTP call)
- The value is computed from other providers or environment variables
- You need conditional logic at startup

---

## Q5. What is `Reflector` and how is it used with custom decorators?

**Answer:**
`Reflector` is a NestJS helper that reads metadata attached to classes or methods using `SetMetadata`.

Pattern:
```typescript
// 1. Create a custom decorator that sets metadata
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

// 2. Use it on a route
@Get()
@Roles('admin', 'moderator')
findAll() {}

// 3. Read it in a guard
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get<string[]>('roles', context.getHandler());
    if (!roles) return true;  // no roles decorator = public route
    const user = context.switchToHttp().getRequest().user;
    return roles.some(role => user.roles.includes(role));
  }
}
```

This is the standard pattern for role-based access control in NestJS.

---

## Q6. What is the difference between `@Res()` and returning a value from a handler?

**Answer:**
**Returning a value (recommended):**
```typescript
@Get()
findAll() {
  return this.tasksService.findAll();  // NestJS serializes to JSON, sends 200
}
```
NestJS manages the response — interceptors, serialization, and status codes all work correctly.

**Using `@Res()` (avoid unless necessary):**
```typescript
@Get()
findAll(@Res() res: Response) {
  res.status(200).json(this.tasksService.findAll());  // you manage response
}
```
This bypasses NestJS's response pipeline. Interceptors that transform responses won't run. It's essentially dropping back to raw Express.

Use `@Res()` only when you need streaming, file downloads, or very specific Express behavior.

---

## Q7. How do you handle async operations in NestJS controllers and services?

**Answer:**
NestJS natively supports `async/await` and Promises everywhere:

```typescript
@Get()
async findAll(): Promise<Task[]> {
  return this.tasksService.findAll();  // awaited automatically by NestJS
}

@Injectable()
export class TasksService {
  async findAll(): Promise<Task[]> {
    return await this.taskRepository.find();
  }
}
```

NestJS also supports RxJS `Observable` returns — this is used in microservices and streaming contexts. For standard REST APIs, `async/await` is the right choice.

If an async operation throws, NestJS catches it and passes it to the exception filter automatically.

---

## Q8. What is a Dynamic Module and when do you use it?

**Answer:**
A Dynamic Module is a module that accepts configuration options at import time and returns a module object at runtime. It's the pattern used by libraries like `TypeOrmModule`, `ConfigModule`.

```typescript
// Module definition
@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseOptions): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        { provide: 'DB_OPTIONS', useValue: options },
        DatabaseService,
      ],
      exports: [DatabaseService],
      global: true,
    };
  }
}

// Usage in AppModule
@Module({
  imports: [DatabaseModule.forRoot({ host: 'localhost', port: 5432 })],
})
export class AppModule {}
```

Use it when you need configurable, reusable modules — same module, different config in different apps.

---

## Q9. How does `whitelist: true` in `ValidationPipe` protect your API?

**Answer:**
`whitelist: true` tells `ValidationPipe` to automatically strip any properties from the request body that are not decorated in the DTO.

```typescript
export class CreateTaskDto {
  @IsString()
  title: string;
  // 'isAdmin' is not here
}

// Client sends: { title: "Buy milk", isAdmin: true }
// After whitelist: { title: "Buy milk" }   ← isAdmin stripped
```

`forbidNonWhitelisted: true` goes further — instead of silently stripping, it throws a `400 Bad Request` if any extra property is sent.

This is important for security: it prevents clients from injecting unexpected fields that could bypass business logic.

---

## Q10. Explain interceptors. What is `next.handle()` and what does the `pipe()` operator do?

**Answer:**
An interceptor uses RxJS Observables to wrap the handler call.

```typescript
intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
  // Code here runs BEFORE the handler
  console.log('Before');

  return next
    .handle()       // ← this actually calls the route handler
    .pipe(
      tap(() => console.log('After')),   // runs after handler resolves
      map(data => ({ success: true, data }))  // transforms the response
    );
}
```

- `next.handle()` — returns an Observable that, when subscribed to, executes the route handler
- `.pipe(map(...))` — transforms the emitted response value
- `.pipe(tap(...))` — side effects (logging, timing) without changing the value
- `.pipe(catchError(...))` — catch errors from the handler inside the interceptor

The Observable approach means interceptors can be used for caching (return early without calling `next.handle()`), timing, and response transformation in one clean abstraction.